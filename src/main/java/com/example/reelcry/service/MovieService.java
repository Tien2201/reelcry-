package com.example.reelcry.service;

import com.example.reelcry.dto.*;
import io.netty.channel.ChannelOption;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

// Nguồn dữ liệu (11/2026):
//   - KKPhim (phimapi.com)        - nguồn chính, có điểm TMDB, trailer, diễn viên
//   - NguonC (phim.nguonc.com)    - nguồn phụ, gộp chung vào danh sách + làm
//                                   nguồn phát dự phòng ở trang xem phim
// OPhim (ophim1.com) đã ngừng hoạt động hẳn: link/lịch sử cũ có src=ophim
// được coi như KKPhim (2 nguồn này dùng chung slug phim).
@Service
public class MovieService {
    private final WebClient webClient;
    private static final String API_BASE = "https://phimapi.com";
    private static final String NGUONC_BASE = "https://phim.nguonc.com/api";

    public static final String SRC_KKPHIM = "kkphim";
    public static final String SRC_NGUONC = NguoncResponse.SOURCE;

    // Chuẩn hoá tên nguồn từ URL (?src=...): chỉ còn "kkphim" hoặc "nguonc"
    public static String normalizeSource(String source) {
        return SRC_NGUONC.equalsIgnoreCase(source) ? SRC_NGUONC : SRC_KKPHIM;
    }

    // Giới hạn thời gian chờ API ngoài: trước đây MovieService dùng
    // WebClient.Builder mặc định (KHÔNG có timeout) nên khi API ngoài treo,
    // cả trang web treo theo, người dùng chỉ thấy màn hình trắng rất lâu
    private static final Duration API_TIMEOUT = Duration.ofSeconds(10);

    // Cache thủ công (TTL) cho các danh sách phim trang chủ - tránh gọi lại API
    // ngoài mỗi lượt truy cập, vì danh sách "mới cập nhật" ít thay đổi trong vài phút
    private static final long LIST_CACHE_TTL_MS = 3 * 60 * 1000; // 3 phút
    // QUAN TRỌNG: phải giới hạn kích thước + tự evict entry cũ nhất (LRU), nếu
    // không map này sẽ phình to vô hạn theo thời gian chạy -> Render OOM (512MB)
    private static final int LIST_CACHE_MAX_SIZE = 60;
    private final Map<String, CachedList> listCache = boundedCache(LIST_CACHE_MAX_SIZE);

    private static class CachedList {
        final List<MovieResponse.MovieItem> data;
        final long timestamp;

        CachedList(List<MovieResponse.MovieItem> data) {
            this.data = data;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > LIST_CACHE_TTL_MS;
        }
    }

    // Trả về bản cache còn hạn nếu có, nếu không thì gọi loader rồi lưu lại kết
    // quả. Không cache danh sách rỗng (API lỗi tạm thời) để lần sau thử lại.
    private Mono<List<MovieResponse.MovieItem>> getCachedList(String key,
            Supplier<Mono<List<MovieResponse.MovieItem>>> loader) {
        CachedList cached = listCache.get(key);
        if (cached != null && !cached.isExpired()) {
            return Mono.just(cached.data);
        }
        return loader.get().doOnNext(data -> {
            if (!data.isEmpty()) listCache.put(key, new CachedList(data));
        });
    }

    // Cache riêng cho chi tiết phim (kèm episodes) - mỗi lần bấm "Xem ngay",
    // đổi tập, đổi server đều gọi lại getDetail() với CÙNG slug
    private static final long DETAIL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
    private static final int DETAIL_CACHE_MAX_SIZE = 150;
    private final Map<String, CachedDetail> detailCache = boundedCache(DETAIL_CACHE_MAX_SIZE);

    // Cache LRU an toàn luồng: tự động xoá entry cũ nhất khi vượt quá kích thước tối đa
    private static <K, V> Map<K, V> boundedCache(int maxSize) {
        return Collections.synchronizedMap(new LinkedHashMap<K, V>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > maxSize;
            }
        });
    }

    private static class CachedDetail {
        final MovieDetailResponse data;
        final long timestamp;

        CachedDetail(MovieDetailResponse data) {
            this.data = data;
            this.timestamp = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > DETAIL_CACHE_TTL_MS;
        }
    }

    public MovieService(WebClient.Builder builder) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
                .responseTimeout(Duration.ofSeconds(8));

        this.webClient = builder
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                // Mặc định chỉ 256KB: JSON chi tiết của phim bộ dài (vài trăm/
                // nghìn tập) vượt mức này -> lỗi -> trang chi tiết bị đá về trang chủ
                .codecs(c -> c.defaultCodecs().maxInMemorySize(8 * 1024 * 1024))
                .defaultHeader(HttpHeaders.USER_AGENT,
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
                .build();
    }

    // Gọi 1 endpoint danh sách của KKPhim; lỗi/timeout trả về danh sách rỗng
    // thay vì làm hỏng cả trang. uriVars được encode đúng chuẩn (từ khoá tìm
    // kiếm có dấu cách, "&", "#"... không còn làm vỡ URL như trước)
    private Mono<MovieResponse> fetchList(String uriTemplate, Object... uriVars) {
        return webClient.get().uri(API_BASE + uriTemplate, uriVars)
                .retrieve()
                .bodyToMono(MovieResponse.class)
                .timeout(API_TIMEOUT)
                .onErrorReturn(new MovieResponse())
                .defaultIfEmpty(new MovieResponse());
    }

    private Mono<List<MovieResponse.MovieItem>> fetchItems(String uriTemplate, Object... uriVars) {
        return fetchList(uriTemplate, uriVars).map(r -> mergeAndSort(null, r.getActualItems()));
    }

    // Gọi 1 endpoint danh sách của NguonC, đổi sang MovieItem; lỗi -> rỗng
    private Mono<List<MovieResponse.MovieItem>> fetchNguonc(String uriTemplate, Object... uriVars) {
        return webClient.get().uri(NGUONC_BASE + uriTemplate, uriVars)
                .retrieve()
                .bodyToMono(NguoncResponse.class)
                .timeout(API_TIMEOUT)
                .map(NguoncResponse::toMovieItems)
                .onErrorReturn(List.of())
                .defaultIfEmpty(List.of());
    }

    // Gộp nhiều danh sách (mỗi item đã gắn sẵn source của mình), loại phim
    // trùng slug - danh sách đứng trước được ưu tiên giữ lại (KKPhim trước vì
    // có điểm TMDB/trailer) - rồi sắp xếp theo thời gian cập nhật mới nhất
    @SafeVarargs
    static List<MovieResponse.MovieItem> mergeSources(List<MovieResponse.MovieItem>... lists) {
        List<MovieResponse.MovieItem> merged = new ArrayList<>();
        Set<String> seenSlugs = new HashSet<>();
        for (List<MovieResponse.MovieItem> list : lists) {
            if (list == null) continue;
            for (MovieResponse.MovieItem item : list) {
                if (item.getSlug() != null && seenSlugs.add(item.getSlug())) {
                    merged.add(item);
                }
            }
        }
        merged.sort(MovieService::compareByModifiedDesc);
        return merged;
    }

    private static int compareByModifiedDesc(MovieResponse.MovieItem a, MovieResponse.MovieItem b) {
        // Chỉ so tới hết phần giây ("2026-10-31T17:43:31") vì 2 nguồn ghi phần
        // lẻ của giây khác độ dài (.000Z vs .000000Z)
        String ta = (a.getModified() != null && a.getModified().getTime() != null)
                ? a.getModified().getTime() : null;
        String tb = (b.getModified() != null && b.getModified().getTime() != null)
                ? b.getModified().getTime() : null;
        if (ta == null && tb == null)
            return 0;
        if (ta == null)
            return 1;
        if (tb == null)
            return -1;
        return tb.substring(0, Math.min(19, tb.length())).compareTo(ta.substring(0, Math.min(19, ta.length())));
    }

    // Gắn nguồn, loại trùng theo slug, sắp xếp theo thời gian cập nhật mới nhất.
    // Giữ lại 2 tham số (từ thời còn gộp OPhim + KKPhim) để không phải sửa test.
    // Lưu ý: để package-private (không phải private) để unit test gọi trực tiếp được
    List<MovieResponse.MovieItem> mergeAndSort(List<MovieResponse.MovieItem> ophimItems,
            List<MovieResponse.MovieItem> kkphimItems) {
        List<MovieResponse.MovieItem> merged = new ArrayList<>();
        Set<String> seenSlugs = new HashSet<>();

        if (ophimItems != null) {
            for (MovieResponse.MovieItem item : ophimItems) {
                item.setSource("ophim");
                if (item.getSlug() != null && seenSlugs.add(item.getSlug())) {
                    merged.add(item);
                }
            }
        }
        if (kkphimItems != null) {
            for (MovieResponse.MovieItem item : kkphimItems) {
                item.setSource("kkphim");
                if (item.getSlug() != null && seenSlugs.add(item.getSlug())) {
                    merged.add(item);
                }
            }
        }

        merged.sort((a, b) -> {
            String ta = (a.getModified() != null) ? a.getModified().getTime() : null;
            String tb = (b.getModified() != null) ? b.getModified().getTime() : null;
            if (ta == null && tb == null)
                return 0;
            if (ta == null)
                return 1;
            if (tb == null)
                return -1;
            return tb.compareTo(ta);
        });

        return merged;
    }

    // Trang chủ (có cache TTL): KKPhim + NguonC gọi song song rồi gộp
    public Mono<List<MovieResponse.MovieItem>> getHomeDataMerged(int page) {
        return getCachedList("home_" + page, () -> Mono.zip(
                fetchItems("/danh-sach/phim-moi-cap-nhat-v3?page={page}", page),
                fetchNguonc("/films/phim-moi-cap-nhat?page={page}", page))
                .map(t -> mergeSources(t.getT1(), t.getT2())));
    }

    // NguonC không có danh sách phim chiếu rạp -> chỉ KKPhim
    public Mono<List<MovieResponse.MovieItem>> getCinemaMoviesMerged(int page) {
        return getCachedList("cinema_" + page, () -> fetchItems(
                "/v1/api/danh-sach/phim-chieu-rap?page={page}&sort_field=modified.time&sort_type=desc", page));
    }

    public Mono<List<MovieResponse.MovieItem>> getAnimeMoviesMerged(int page) {
        return getCachedList("anime_" + page, () -> Mono.zip(
                fetchItems("/v1/api/danh-sach/hoat-hinh?page={page}&sort_field=modified.time&sort_type=desc", page),
                fetchNguonc("/films/danh-sach/hoat-hinh?page={page}", page))
                .map(t -> mergeSources(t.getT1(), t.getT2())));
    }

    // Tìm kiếm: KKPhim 48 kết quả + NguonC 2 trang đầu (mỗi trang chỉ 10 phim)
    public Mono<List<MovieResponse.MovieItem>> searchMoviesMerged(String keyword) {
        return Mono.zip(
                fetchItems("/v1/api/tim-kiem?keyword={keyword}&limit=48", keyword),
                fetchNguonc("/films/search?keyword={keyword}&page=1", keyword),
                fetchNguonc("/films/search?keyword={keyword}&page=2", keyword))
                .map(t -> mergeSources(t.getT1(), t.getT2(), t.getT3()));
    }

    // Chi tiết phim theo đúng nguồn (có cache TTL 5 phút)
    public Mono<MovieDetailResponse> getDetail(String slug, String source) {
        String src = normalizeSource(source);
        String cacheKey = src + ":" + slug;
        CachedDetail cached = detailCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            return Mono.just(cached.data);
        }

        Mono<MovieDetailResponse> request = SRC_NGUONC.equals(src)
                ? webClient.get().uri(NGUONC_BASE + "/film/{slug}", slug)
                        .retrieve()
                        .bodyToMono(NguoncResponse.class)
                        .map(NguoncResponse::toDetailResponse)
                : webClient.get().uri(API_BASE + "/phim/{slug}", slug)
                        .retrieve()
                        .bodyToMono(MovieDetailResponse.class);

        return request
                .timeout(API_TIMEOUT)
                .filter(data -> data.isSuccess() && data.getActualItem() != null)
                .doOnNext(data -> detailCache.put(cacheKey, new CachedDetail(data)))
                .onErrorResume(e -> Mono.empty());
    }

    // Kết quả chi tiết phim kèm tên nguồn thực sự lấy được dữ liệu
    public record SourcedDetail(String source, MovieDetailResponse detail) {
    }

    // Lấy chi tiết từ nguồn được chọn; nếu nguồn đó không có phim này (hoặc
    // lỗi) thì tự thử nguồn còn lại - phim chỉ có ở NguonC vẫn mở được
    public Mono<SourcedDetail> getDetailAnySource(String slug, String preferredSource) {
        String first = normalizeSource(preferredSource);
        String second = SRC_NGUONC.equals(first) ? SRC_KKPHIM : SRC_NGUONC;
        return getDetail(slug, first).map(d -> new SourcedDetail(first, d))
                .switchIfEmpty(Mono.defer(() -> getDetail(slug, second).map(d -> new SourcedDetail(second, d))));
    }

    // Kiểm tra phim có trailer hay không - dùng cho tính năng lọc "chỉ hiện
    // phim có trailer" trên trang chủ. Tận dụng lại cache chi tiết phim sẵn có
    public Mono<Boolean> hasTrailer(String slug, String source) {
        // Chỉ KKPhim có thông tin trailer (NguonC không có) -> luôn tra ở KKPhim
        return getDetail(slug, SRC_KKPHIM)
                .map(detail -> {
                    var item = detail.getActualItem();
                    return item != null && item.getTrailer_url() != null && !item.getTrailer_url().isBlank();
                })
                .defaultIfEmpty(false)
                .onErrorReturn(false);
    }

    // Lọc theo thể loại / quốc gia / danh sách (category = the-loai | quoc-gia | danh-sach)
    // KKPhim (24 phim/trang) + NguonC (10 phim/trang) cùng số trang, gộp lại;
    // số trang/tiêu đề lấy theo KKPhim. NguonC chỉ có 1 số danh sách, danh
    // sách nào không có thì NguonC trả 404 -> coi như rỗng.
    public Mono<MovieResponse> getMoviesByFilter(String category, String slug, int page, String source) {
        Mono<MovieResponse> kk = fetchList(
                "/v1/api/{category}/{slug}?page={page}&sort_field=modified.time&sort_type=desc",
                category, slug, page);
        Mono<List<MovieResponse.MovieItem>> nc = "danh-sach".equals(category) && "phim-moi-cap-nhat".equals(slug)
                ? fetchNguonc("/films/phim-moi-cap-nhat?page={page}", page)
                : fetchNguonc("/films/{category}/{slug}?page={page}", category, slug, page);

        return Mono.zip(kk, nc).map(t -> {
            MovieResponse resp = t.getT1();
            List<MovieResponse.MovieItem> kkItems = resp.getActualItems();
            if (kkItems != null) kkItems.forEach(i -> i.setSource(SRC_KKPHIM));
            if (resp.getData() == null) resp.setData(new MovieResponse.MovieData());
            resp.getData().setItems(mergeSources(kkItems, t.getT2()));
            return resp;
        });
    }

    public Mono<MoviePeoplesResponse> getPeoples(String slug) {
        return webClient.get().uri(API_BASE + "/v1/api/phim/{slug}/peoples", slug).retrieve()
                .bodyToMono(MoviePeoplesResponse.class)
                .timeout(Duration.ofSeconds(5))
                .onErrorReturn(new MoviePeoplesResponse())
                .defaultIfEmpty(new MoviePeoplesResponse());
    }

    // Danh sách thể loại/quốc gia gần như không bao giờ đổi, nhưng hiện trên
    // MỌI trang (menu bên trái) -> cache dài hạn (12 giờ)
    private static final long CATEGORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ
    private volatile CategoryResponse cachedGenres;
    private volatile long cachedGenresTime;
    private volatile CategoryResponse cachedCountries;
    private volatile long cachedCountriesTime;

    public Mono<CategoryResponse> getGenres() {
        if (cachedGenres != null && System.currentTimeMillis() - cachedGenresTime < CATEGORY_CACHE_TTL_MS) {
            return Mono.just(cachedGenres);
        }
        return webClient.get().uri(API_BASE + "/the-loai").retrieve().bodyToMono(CategoryResponse.class)
                .timeout(API_TIMEOUT)
                .doOnNext(data -> {
                    cachedGenres = data;
                    cachedGenresTime = System.currentTimeMillis();
                });
    }

    public Mono<CategoryResponse> getCountries() {
        if (cachedCountries != null && System.currentTimeMillis() - cachedCountriesTime < CATEGORY_CACHE_TTL_MS) {
            return Mono.just(cachedCountries);
        }
        return webClient.get().uri(API_BASE + "/quoc-gia").retrieve().bodyToMono(CategoryResponse.class)
                .timeout(API_TIMEOUT)
                .doOnNext(data -> {
                    cachedCountries = data;
                    cachedCountriesTime = System.currentTimeMillis();
                });
    }
}
