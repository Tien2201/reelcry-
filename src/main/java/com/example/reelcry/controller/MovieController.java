package com.example.reelcry.controller;

import java.util.Collections;
import com.example.reelcry.dto.*;
import com.example.reelcry.service.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import com.example.reelcry.repository.WatchHistoryRepository;
import org.springframework.security.core.Authentication;

@Controller
public class MovieController {

    private final MovieService movieService;
    private final WatchHistoryRepository watchHistoryRepository;

    public MovieController(MovieService movieService, WatchHistoryRepository watchHistoryRepository) {
        this.movieService = movieService;
        this.watchHistoryRepository = watchHistoryRepository;
    }

    @GetMapping("/")
    public String getIndex(@RequestParam(defaultValue = "1") int page, Model model, Authentication authentication) {
        // Mặc định trang chủ lấy OPhim, nếu muốn Kiệt có thể đổi thành "kkphim"
        MovieResponse response = movieService.getHomeData(page).block();

        if (response != null) {
            // SỬA: Dùng getActualItems() để không bị lỗi Null khi đổi API
            model.addAttribute("movies", response.getActualItems());

            // Xử lý phân trang an toàn
            if (response.getData() != null && response.getData().getParams() != null
                    && response.getData().getParams().getPagination() != null) {
                model.addAttribute("currentPage", response.getData().getParams().getPagination().getCurrentPage());
            } else {
                model.addAttribute("currentPage", page);
            }
        }

        MovieResponse vnResponse = movieService.getMoviesByCountry("viet-nam", 1).block();
        if (vnResponse != null) {
            model.addAttribute("moviesVN", vnResponse.getActualItems());
        }

        MovieResponse cinemaResponse = movieService.getCinemaMovies(1).block();
        if (cinemaResponse != null) {
            model.addAttribute("moviesCinema", cinemaResponse.getActualItems());
        }
        if (authentication != null) {
            model.addAttribute("watchHistory",
                    watchHistoryRepository.findByUsernameOrderByWatchedAtDesc(authentication.getName()));
        }
        return "index";
    }

    @GetMapping("/search")
    public String search(@RequestParam String keyword, Model model) {
        MovieResponse response = movieService.searchMovies(keyword).block();
        if (response != null) {
            model.addAttribute("movies", response.getActualItems());
            model.addAttribute("searchTerm", keyword);
        }
        return "index";
    }

    // --- TRANG CHI TIẾT PHIM ---
    @GetMapping("/phim/{slug}")
    public String showDetail(@PathVariable String slug,
            @RequestParam(defaultValue = "ophim") String src,
            @RequestParam(required = false) String notice,
            Model model) {
        MovieDetailResponse detail = movieService.getDetail(slug, src).block();

        // SỬA: Dùng hàm isSuccess() mới để check an toàn cho cả 2 API
        if (detail != null && detail.isSuccess() && detail.getActualItem() != null) {
            var movie = detail.getActualItem();
            model.addAttribute("movie", movie);
            model.addAttribute("notice", notice);

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