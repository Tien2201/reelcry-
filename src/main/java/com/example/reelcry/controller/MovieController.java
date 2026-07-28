package com.example.reelcry.controller;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import com.example.reelcry.dto.*;
import com.example.reelcry.service.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import com.example.reelcry.repository.WatchHistoryRepository;
import com.example.reelcry.repository.FavoriteRepository;
import org.springframework.security.core.Authentication;
import reactor.core.publisher.Mono;

@Controller
public class MovieController {

    private final MovieService movieService;
    private final WatchHistoryRepository watchHistoryRepository;
    private final FavoriteRepository favoriteRepository;

    public MovieController(MovieService movieService, WatchHistoryRepository watchHistoryRepository,
            FavoriteRepository favoriteRepository) {
        this.movieService = movieService;
        this.watchHistoryRepository = watchHistoryRepository;
        this.favoriteRepository = favoriteRepository;
    }

    @GetMapping("/")
    public String getIndex(@RequestParam(defaultValue = "1") int page, Model model, Authentication authentication) {
        // Chạy song song 3 nguồn dữ liệu trang chủ (mới cập nhật, hoạt hình, chiếu
        // rạp) thay vì gọi tuần tự -> giảm thời gian tải trang chủ đáng kể
        var combined = Mono.zip(
                movieService.getHomeDataMerged(page),
                movieService.getAnimeMoviesMerged(1),
                movieService.getCinemaMoviesMerged(1))
                .block();

        model.addAttribute("movies", combined.getT1());
        model.addAttribute("currentPage", page);
        model.addAttribute("moviesAnime", combined.getT2());
        model.addAttribute("moviesCinema", combined.getT3());

        if (authentication != null) {
            model.addAttribute("watchHistory",
                    watchHistoryRepository.findByUsernameOrderByWatchedAtDesc(authentication.getName()));
            model.addAttribute("favorites",
                    favoriteRepository.findByUsernameOrderByAddedAtDesc(authentication.getName()));
        }
        return "index";
    }

    @GetMapping("/search")
    public String search(@RequestParam String keyword, Model model) {
        var movies = movieService.searchMoviesMerged(keyword).block();
        model.addAttribute("movies", movies);
        model.addAttribute("searchTerm", keyword);
        return "index";
    }

    // --- TRANG CHI TIẾT PHIM ---
    @GetMapping("/phim/{slug}")
    public String showDetail(@PathVariable String slug,
            @RequestParam(defaultValue = "ophim") String src,
            @RequestParam(required = false) String notice,
            Model model, Authentication authentication) {
        MovieDetailResponse detail = movieService.getDetail(slug, src).block();

        // SỬA: Dùng hàm isSuccess() mới để check an toàn cho cả 2 API
        if (detail != null && detail.isSuccess() && detail.getActualItem() != null) {
            var movie = detail.getActualItem();
            model.addAttribute("movie", movie);
            model.addAttribute("notice", notice);
            model.addAttribute("currentSource", src);
            // KKPhim trả "episodes" ở ngoài cùng JSON (không nằm trong "movie"), nên phải lấy
            // qua getActualEpisodes() thay vì movie.episodes để dùng được cho cả 2 nguồn
            model.addAttribute("episodes", detail.getActualEpisodes());

            boolean isFavorite = authentication != null
                    && favoriteRepository.existsByUsernameAndMovieSlug(authentication.getName(), slug);
            model.addAttribute("isFavorite", isFavorite);

            // Nếu tài khoản này đã xem dở phim này (đúng nguồn đang xem), cho nút
            // "Xem ngay" trỏ tới đúng tập/server đã xem dở thay vì luôn bắt đầu lại
            // từ tập 1 - trước đây bị bỏ sót, luôn hardcode sv=0 không kèm ep.
            if (authentication != null) {
                watchHistoryRepository.findByUsernameAndMovieSlug(authentication.getName(), slug)
                        .ifPresent(h -> {
                            if (src.equalsIgnoreCase(h.getSource()) && h.getEpSlug() != null) {
                                model.addAttribute("resumeEpSlug", h.getEpSlug());
                                model.addAttribute("resumeServerIndex",
                                        h.getServerIndex() != null ? h.getServerIndex() : 0);
                            }
                        });
            }

            // Phim liên quan: lấy theo thể loại đầu tiên của phim đang xem, loại
            // trừ chính nó. Không gộp OPhim+KKPhim ở đây (chỉ cần đủ dùng, tránh
            // tốn thêm 1 lệnh gọi API song song không cần thiết cho 1 khu vực phụ)
            List<MovieResponse.MovieItem> relatedMovies = Collections.emptyList();
            String relatedGenreName = null;
            if (movie.getCategory() != null && !movie.getCategory().isEmpty()) {
                var genre = movie.getCategory().get(0);
                relatedGenreName = genre.getName();
                try {
                    MovieResponse relatedResp = movieService.getMoviesByFilter("the-loai", genre.getSlug(), 1, src)
                            .block();
                    if (relatedResp != null && relatedResp.getActualItems() != null) {
                        relatedMovies = relatedResp.getActualItems().stream()
                                .filter(item -> item.getSlug() != null && !item.getSlug().equals(slug))
                                .peek(item -> item.setSource(src))
                                .limit(12)
                                .collect(Collectors.toList());
                    }
                } catch (Exception e) {
                    // giữ relatedMovies rỗng nếu API lỗi, không làm hỏng cả trang
                }
            }
            model.addAttribute("relatedMovies", relatedMovies);
            model.addAttribute("relatedGenreName", relatedGenreName);

            try {
                MoviePeoplesResponse peoples = movieService.getPeoples(slug).block();
                if (peoples != null && peoples.getData() != null) {
                    model.addAttribute("actors", peoples.getData().getPeoples());
                } else {
                    model.addAttribute("actors", Collections.emptyList());
                }
            } catch (Exception e) {
                model.addAttribute("actors", Collections.emptyList());
            }
            return "detail";
        }
        return "redirect:/";
    }

    // --- TRANG XEM PHIM ---
    @GetMapping("/xem-phim/{slug}")
    public String watchMovie(@PathVariable String slug,
            @RequestParam(defaultValue = "tap-01") String ep,
            @RequestParam(defaultValue = "0") int sv,
            @RequestParam(defaultValue = "ophim") String src,
            Model model) {
        try {
            MovieDetailResponse response = movieService.getDetail(slug, src).block();

            // SỬA: Dùng hàm isSuccess() để tránh lỗi văng khi API trả về "success" thay vì
            // true
            if (response != null && response.isSuccess()) {
                var movie = response.getActualItem();
                var allServers = response.getActualEpisodes();

                if (movie != null && allServers != null && !allServers.isEmpty()) {
                    int serverIndex = Math.min(sv, allServers.size() - 1);
                    var currentServer = allServers.get(serverIndex);

                    var episodeData = currentServer.getServer_data().stream()
                            .filter(e -> e.getSlug().equals(ep))
                            .findFirst()
                            .orElse(currentServer.getServer_data().get(0));

                    model.addAttribute("movie", movie);
                    model.addAttribute("episodes", allServers);
                    model.addAttribute("currentServer", currentServer);
                    model.addAttribute("currentLink", episodeData.getLink_embed());
                    model.addAttribute("currentEpSlug", episodeData.getSlug());
                    model.addAttribute("selectedSv", serverIndex);
                    model.addAttribute("currentSource", src);

                    return "watch";
                }
            }
        } catch (Exception e) {
            System.err.println("Lỗi xử lý tại Controller: " + e.getMessage());
        }
        // Nếu không tìm thấy phim hoặc lỗi, quay lại trang chi tiết kèm thông báo rõ
        // ràng
        return "redirect:/phim/" + slug + "?notice=missing_source";
    }

    @GetMapping("/filter/{category}/{slug}")
    public String filterMovies(@PathVariable String category,
            @PathVariable String slug,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "ophim") String src, Model model) {
        try {
            MovieResponse response = movieService.getMoviesByFilter(category, slug, page, src).block();

            if (response != null) {
                model.addAttribute("movies", response.getActualItems());

                // Params và pagination thường chỉ có ở OPhim, nên check kỹ
                if (response.getData() != null && response.getData().getParams() != null) {
                    var params = response.getData().getParams();
                    model.addAttribute("title", params.getTitle());
                    if (params.getPagination() != null) {
                        model.addAttribute("currentPage", params.getPagination().getCurrentPage());
                    }
                } else {
                    model.addAttribute("currentPage", page);
                }

                model.addAttribute("currentCategory", category);
                model.addAttribute("currentSlug", slug);
                model.addAttribute("currentSource", src);
            }
        } catch (Exception e) {
            model.addAttribute("movies", Collections.emptyList());
        }
        return "index";
    }
}