package com.example.reelcry.controller;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    public String search(@RequestParam(defaultValue = "") String keyword, Model model) {
        keyword = keyword.trim();
        if (keyword.isEmpty()) {
            return "redirect:/";
        }
        var movies = movieService.searchMoviesMerged(keyword).block();
        model.addAttribute("movies", movies);
        model.addAttribute("searchTerm", keyword);
        model.addAttribute("title", "Kết quả cho \"" + keyword + "\"");
        return "index";
    }

    // --- TRANG CHI TIẾT PHIM ---
    @GetMapping("/phim/{slug}")
    public String showDetail(@PathVariable String slug,
            @RequestParam(defaultValue = "kkphim") String src,
            @RequestParam(required = false) String notice,
            Model model, Authentication authentication) {
        MovieDetailResponse detail = movieService.getDetail(slug, src).block();

        if (detail == null || !detail.isSuccess() || detail.getActualItem() == null) {
            return "redirect:/";
        }

        var movie = detail.getActualItem();
        model.addAttribute("movie", movie);
        model.addAttribute("notice", notice);
        model.addAttribute("currentSource", "kkphim");
        model.addAttribute("episodes", detail.getActualEpisodes());

        boolean isFavorite = authentication != null
                && favoriteRepository.existsByUsernameAndMovieSlug(authentication.getName(), slug);
        model.addAttribute("isFavorite", isFavorite);

        // Nếu tài khoản này đã xem dở phim này, cho nút "Xem ngay" trỏ tới đúng
        // tập/server đã xem dở thay vì luôn bắt đầu lại từ tập 1
        if (authentication != null) {
            watchHistoryRepository.findByUsernameAndMovieSlug(authentication.getName(), slug)
                    .ifPresent(h -> {
                        if (h.getEpSlug() != null) {
                            model.addAttribute("resumeEpSlug", h.getEpSlug());
                            model.addAttribute("resumeServerIndex",
                                    h.getServerIndex() != null ? h.getServerIndex() : 0);
                        }
                    });
        }

        // Phim liên quan (theo thể loại đầu tiên) + diễn viên: gọi SONG SONG thay
        // vì lần lượt như trước (mỗi lệnh ~1 giây -> trang chi tiết nhanh hơn ~1 giây)
        String relatedGenreName = null;
        Mono<List<MovieResponse.MovieItem>> relatedMono = Mono.just(Collections.emptyList());
        if (movie.getCategory() != null && !movie.getCategory().isEmpty()) {
            var genre = movie.getCategory().get(0);
            relatedGenreName = genre.getName();
            relatedMono = movieService.getMoviesByFilter("the-loai", genre.getSlug(), 1, src)
                    .map(resp -> resp.getActualItems() == null
                            ? Collections.<MovieResponse.MovieItem>emptyList()
                            : resp.getActualItems().stream()
                                    .filter(item -> item.getSlug() != null && !item.getSlug().equals(slug))
                                    .limit(12)
                                    .collect(Collectors.toList()));
        }

        var extras = Mono.zip(relatedMono, movieService.getPeoples(slug)).block();
        model.addAttribute("relatedMovies", extras.getT1());
        model.addAttribute("relatedGenreName", relatedGenreName);

        MoviePeoplesResponse peoples = extras.getT2();
        List<MoviePeoplesResponse.Person> actors = peoples != null && peoples.getData() != null
                && peoples.getData().getPeoples() != null
                        ? peoples.getData().getPeoples()
                        : Collections.emptyList();
        model.addAttribute("actors", actors);

        // Ảnh đạo diễn: tra theo tên trong danh sách diễn viên/ê-kíp (TMDB). Làm ở
        // đây thay vì biểu thức lọc trong template - biểu thức cũ
        // actors.?[name == dName] bị lỗi SpEL làm sập cả trang chi tiết
        Map<String, String> directorPhotos = new HashMap<>();
        for (MoviePeoplesResponse.Person p : actors) {
            if (p.getName() != null && p.getProfilePhotoUrl() != null) {
                directorPhotos.putIfAbsent(p.getName(), p.getProfilePhotoUrl());
            }
        }
        model.addAttribute("directorPhotos", directorPhotos);
        return "detail";
    }

    // --- TRANG XEM PHIM ---
    @GetMapping("/xem-phim/{slug}")
    public String watchMovie(@PathVariable String slug,
            @RequestParam(defaultValue = "tap-01") String ep,
            @RequestParam(defaultValue = "0") int sv,
            @RequestParam(defaultValue = "kkphim") String src,
            Model model, Authentication authentication) {
        try {
            MovieDetailResponse response = movieService.getDetail(slug, src).block();

            if (response != null && response.isSuccess()) {
                var movie = response.getActualItem();
                var allServers = response.getActualEpisodes();

                if (movie != null && allServers != null && !allServers.isEmpty()) {
                    int serverIndex = Math.max(0, Math.min(sv, allServers.size() - 1));
                    var currentServer = allServers.get(serverIndex);

                    if (currentServer.getServer_data() != null && !currentServer.getServer_data().isEmpty()) {
                        var episodeData = currentServer.getServer_data().stream()
                                .filter(e -> ep.equals(e.getSlug()))
                                .findFirst()
                                .orElse(currentServer.getServer_data().get(0));

                        model.addAttribute("movie", movie);
                        model.addAttribute("episodes", allServers);
                        model.addAttribute("currentServer", currentServer);
                        model.addAttribute("currentLink", episodeData.getLink_embed());
                        model.addAttribute("currentEpSlug", episodeData.getSlug());
                        model.addAttribute("currentEpName", episodeData.getName());
                        model.addAttribute("selectedSv", serverIndex);
                        model.addAttribute("currentSource", "kkphim");
                        model.addAttribute("isFavorite", authentication != null
                                && favoriteRepository.existsByUsernameAndMovieSlug(authentication.getName(), slug));

                        return "watch";
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Lỗi xử lý tại Controller: " + e.getMessage());
        }
        // Nếu không tìm thấy phim hoặc lỗi, quay lại trang chi tiết kèm thông báo rõ ràng
        return "redirect:/phim/" + slug + "?notice=missing_source";
    }

    @GetMapping("/filter/{category}/{slug}")
    public String filterMovies(@PathVariable String category,
            @PathVariable String slug,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "kkphim") String src, Model model) {
        model.addAttribute("currentCategory", category);
        model.addAttribute("currentSlug", slug);
        model.addAttribute("currentSource", "kkphim");
        model.addAttribute("currentPage", page);

        MovieResponse response = movieService.getMoviesByFilter(category, slug, page, src).block();
        if (response != null && response.getActualItems() != null) {
            model.addAttribute("movies", response.getActualItems());
            if (response.getData() != null) {
                var data = response.getData();
                if (data.getTitlePage() != null) {
                    model.addAttribute("title", data.getTitlePage());
                } else if (data.getParams() != null && data.getParams().getTitle() != null) {
                    model.addAttribute("title", data.getParams().getTitle());
                }
                if (data.getParams() != null && data.getParams().getPagination() != null) {
                    var p = data.getParams().getPagination();
                    model.addAttribute("currentPage", p.getCurrentPage() > 0 ? p.getCurrentPage() : page);
                    model.addAttribute("totalPages", p.getTotalPages());
                }
            }
        } else {
            model.addAttribute("movies", Collections.emptyList());
        }
        return "index";
    }
}
