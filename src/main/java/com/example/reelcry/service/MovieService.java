package com.example.reelcry.service;

import com.example.reelcry.dto.*;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

@Service
public class MovieService {
    private final WebClient webClient;
    private final String OPHIM_BASE = "https://ophim1.com";
    private final String KKPHIM_BASE = "https://kkphim.vip";
    private final String KKPHIM_API_BASE = "https://phimapi.com";

    // Cache thủ công (TTL) cho các danh sách phim trang chủ - tránh gọi lại API
    // ngoài (OPhim/KKPhim) mỗi lượt truy cập, vì danh sách "mới cập nhật" ít
    // thay đổi trong vài phút
    private static final long LIST_CACHE_TTL_MS = 3 * 60 * 1000; // 3 phút
    // QUAN TRỌNG: phải giới hạn kích thước + tự evict entry cũ nhất (LRU), nếu
    // không map này sẽ phình to vô hạn theo thời gian chạy (mỗi trang/mỗi
    // category khác nhau từng được xem sẽ nằm mãi trong RAM) -> nguyên nhân
    // chính gây OOM (Render báo "Ran out of memory (used over 512MB)") sau
    // vài chục phút có traffic. Trước đây dùng ConcurrentHashMap thường,
    // không bao giờ xoá bớt.
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
    // quả. Lưu ý: không cache Mono trực tiếp (Mono nguội sẽ gọi lại API mỗi lần
    // subscribe), mà cache giá trị List đã resolve.
    private Mono<List<MovieResponse.MovieItem>> getCachedList(String key,
            Supplier<Mono<List<MovieResponse.MovieItem>>> loader) {
        CachedList cached = listCache.get(key);
        if (cached != null && !cached.isExpired()) {
            return Mono.just(cached.data);
        }
        return loader.get().doOnNext(data -> listCache.put(key, new CachedList(data)));
    }

    // Cache riêng cho chi tiết phim (kèm episodes) - vì mỗi lần bấm "Xem ngay",
    // đổi tập, đổi server đều gọi lại getDetail() với CÙNG slug+source, dù
    // thông tin phim không hề đổi trong vài phút -> gây chậm rõ rệt, nhất là
    // trên mobile (thêm 1 chặng gọi API ngoài mỗi lần bấm)
    private static final long DETAIL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
    // Cùng lý do như listCache ở trên: mỗi phim khác nhau từng được mở trang
    // chi tiết sẽ tạo 1 key mới, nếu không giới hạn thì cache này là nguyên
    // nhân lớn nhất gây rò rỉ RAM (web phim có hàng nghìn phim, mỗi response
    // chi tiết lại khá nặng do chứa toàn bộ danh sách tập/server).
    private static final int DETAIL_CACHE_MAX_SIZE = 150;
    private final Map<String, CachedDetail> detailCache = boundedCache(DETAIL_CACHE_MAX_SIZE);

    // Cache LRU an toàn luồng: tự động xoá entry cũ nhất (ít dùng gần đây
    // nhất) khi vượt quá kích thước tối đa, thay vì phình to mãi không kiểm
    // soát như ConcurrentHashMap thường.
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
        this.webClient = builder
                .defaultHeader(HttpHeaders.USER_AGENT,
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .defaultHeader(HttpHeaders.REFERER, "https://ophim1.com/")
                .build();
    }

    private String getBaseUrl(String source) {
        return "kkphim".equalsIgnoreCase(source) ? KKPHIM_BASE : OPHIM_BASE;
    }

    public Mono<MovieResponse> getHomeData(int page) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/danh-sach/phim-moi-cap-nhat?page=" + page).retrieve()
                .bodyToMono(MovieResponse.class);
    }

    // ===== KKPhim (phimapi.com) - dùng để gộp chung vào danh sách trang chủ =====
    public Mono<MovieResponse> getHomeDataKK(int page) {
        return webClient.get().uri(KKPHIM_API_BASE + "/danh-sach/phim-moi-cap-nhat?page=" + page).retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    public Mono<MovieResponse> getMoviesByCountryKK(String countrySlug, int page) {
        return webClient.get()
                .uri(KKPHIM_API_BASE + "/v1/api/quoc-gia/" + countrySlug + "?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    // Phim hoạt hình / anime
    public Mono<MovieResponse> getAnimeMovies(int page) {
        return webClient.get()
                .uri(OPHIM_BASE + "/v1/api/danh-sach/hoat-hinh?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    public Mono<MovieResponse> getAnimeMoviesKK(int page) {
        return webClient.get()
                .uri(KKPHIM_API_BASE + "/v1/api/danh-sach/hoat-hinh?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    public Mono<MovieResponse> getCinemaMoviesKK(int page) {
        return webClient.get()
                .uri(KKPHIM_API_BASE + "/v1/api/danh-sach/phim-chieu-rap?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    public Mono<MovieResponse> searchMoviesKK(String keyword) {
        return webClient.get().uri(KKPHIM_API_BASE + "/v1/api/tim-kiem?keyword=" + keyword).retrieve()
                .bodyToMono(MovieResponse.class)
                .onErrorReturn(new MovieResponse());
    }

    // Gộp danh sách từ OPhim + KKPhim: gắn nguồn, loại trùng theo slug, sắp xếp theo thời gian cập nhật mới nhất
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

    // Gọi song song OPhim + KKPhim rồi gộp lại, dùng cho trang chủ (có cache TTL)
    public Mono<List<MovieResponse.MovieItem>> getHomeDataMerged(int page) {
        return getCachedList("home_" + page, () -> Mono.zip(
                getHomeData(page).onErrorReturn(new MovieResponse()),
                getHomeDataKK(page))
                .map(t -> mergeAndSort(t.getT1().getActualItems(), t.getT2().getActualItems())));
    }

    public Mono<List<MovieResponse.MovieItem>> getMoviesByCountryMerged(String countrySlug, int page) {
        return Mono.zip(
                getMoviesByCountry(countrySlug, page).onErrorReturn(new MovieResponse()),
                getMoviesByCountryKK(countrySlug, page))
                .map(t -> mergeAndSort(t.getT1().getActualItems(), t.getT2().getActualItems()));
    }

    public Mono<List<MovieResponse.MovieItem>> getCinemaMoviesMerged(int page) {
        return getCachedList("cinema_" + page, () -> Mono.zip(
                getCinemaMovies(page).onErrorReturn(new MovieResponse()),
                getCinemaMoviesKK(page))
                .map(t -> mergeAndSort(t.getT1().getActualItems(), t.getT2().getActualItems())));
    }

    public Mono<List<MovieResponse.MovieItem>> getAnimeMoviesMerged(int page) {
        return getCachedList("anime_" + page, () -> Mono.zip(
                getAnimeMovies(page).onErrorReturn(new MovieResponse()),
                getAnimeMoviesKK(page))
                .map(t -> mergeAndSort(t.getT1().getActualItems(), t.getT2().getActualItems())));
    }

    public Mono<List<MovieResponse.MovieItem>> searchMoviesMerged(String keyword) {
        return Mono.zip(
                searchMovies(keyword).onErrorReturn(new MovieResponse()),
                searchMoviesKK(keyword))
                .map(t -> mergeAndSort(t.getT1().getActualItems(), t.getT2().getActualItems()));
    }

    // Fix lỗi getDetail: nhận 2 tham số slug và source (có cache TTL 5 phút)
    public Mono<MovieDetailResponse> getDetail(String slug, String source) {
        String cacheKey = (source == null ? "ophim" : source.toLowerCase()) + "_" + slug;
        CachedDetail cached = detailCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            return Mono.just(cached.data);
        }

        String finalUrl;

        if ("kkphim".equalsIgnoreCase(source)) {
            // Theo ảnh: https://phimapi.com/phim/{slug}
            finalUrl = "https://phimapi.com/phim/" + slug;
        } else {
            // Theo OPhim: https://ophim1.com/v1/api/phim/{slug}
            finalUrl = "https://ophim1.com/v1/api/phim/" + slug;
        }

        return this.webClient.get()
                .uri(finalUrl)
                .header(HttpHeaders.USER_AGENT, "Mozilla/5.0 ...")
                .retrieve()
                .onStatus(status -> status.isError(), response -> Mono.empty())
                .bodyToMono(MovieDetailResponse.class)
                .doOnNext(data -> detailCache.put(cacheKey, new CachedDetail(data)))
                .onErrorResume(e -> Mono.empty());
    }

    // Fix lỗi getMoviesByFilter: nhận thêm tham số source
    public Mono<MovieResponse> getMoviesByFilter(String category, String slug, int page, String source) {
        String path = "kkphim".equalsIgnoreCase(source) ? "/v1/api/danh-sach/" : "/v1/api/";
        return webClient.get().uri(getBaseUrl(source) + path + category + "/" + slug + "?page=" + page).retrieve()
                .bodyToMono(MovieResponse.class);
    }

    // Fix lỗi getMoviesByCountry: Thêm hàm này vào Service
    public Mono<MovieResponse> getMoviesByCountry(String countrySlug, int page) {
        return webClient.get()
                .uri(OPHIM_BASE + "/v1/api/quoc-gia/" + countrySlug + "?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class);
    }

    // Phim chiếu rạp, sắp xếp theo mới cập nhật nhất
    public Mono<MovieResponse> getCinemaMovies(int page) {
        return webClient.get()
                .uri(OPHIM_BASE + "/v1/api/danh-sach/phim-chieu-rap?page=" + page
                        + "&sort_field=modified.time&sort_type=desc")
                .retrieve()
                .bodyToMono(MovieResponse.class);
    }

    // Fix lỗi getPeoples: Thêm hàm này vào Service
    public Mono<MoviePeoplesResponse> getPeoples(String slug) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/phim/" + slug + "/peoples").retrieve()
                .bodyToMono(MoviePeoplesResponse.class)
                .onErrorReturn(new MoviePeoplesResponse());
    }

    // Danh sách thể loại/quốc gia gần như không bao giờ đổi, nhưng bị gọi TRƯỚC
    // MỌI request (qua GlobalControllerAdvice) -> cache dài hạn (12 giờ) để
    // không tốn thêm 2 lệnh gọi API ngoài mỗi lần vào bất kỳ trang nào
    private static final long CATEGORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ
    private volatile CategoryResponse cachedGenres;
    private volatile long cachedGenresTime;
    private volatile CategoryResponse cachedCountries;
    private volatile long cachedCountriesTime;

    public Mono<CategoryResponse> getGenres() {
        if (cachedGenres != null && System.currentTimeMillis() - cachedGenresTime < CATEGORY_CACHE_TTL_MS) {
            return Mono.just(cachedGenres);
        }
        return webClient.get().uri(OPHIM_BASE + "/v1/api/the-loai").retrieve().bodyToMono(CategoryResponse.class)
                .doOnNext(data -> {
                    cachedGenres = data;
                    cachedGenresTime = System.currentTimeMillis();
                });
    }

    public Mono<CategoryResponse> getCountries() {
        if (cachedCountries != null && System.currentTimeMillis() - cachedCountriesTime < CATEGORY_CACHE_TTL_MS) {
            return Mono.just(cachedCountries);
        }
        return webClient.get().uri(OPHIM_BASE + "/v1/api/quoc-gia").retrieve().bodyToMono(CategoryResponse.class)
                .doOnNext(data -> {
                    cachedCountries = data;
                    cachedCountriesTime = System.currentTimeMillis();
                });
    }

    public Mono<MovieResponse> searchMovies(String keyword) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/tim-kiem?keyword=" + keyword).retrieve()
                .bodyToMono(MovieResponse.class);
    }
}