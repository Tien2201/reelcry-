package com.example.reelcry.controller;

import com.example.reelcry.service.MovieService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

// Các API nhỏ phục vụ tương tác trên card phim (không phải trang chi tiết
// đầy đủ) - hiện tại dùng cho tính năng lọc "chỉ hiện phim có trailer".
@RestController
@RequestMapping("/api/movies")
public class MovieApiController {

    private final MovieService movieService;

    public MovieApiController(MovieService movieService) {
        this.movieService = movieService;
    }

    public static class TrailerCheckItem {
        public String slug;
        public String source;
    }

    public static class TrailerCheckRequest {
        public List<TrailerCheckItem> items;
    }

    // Kiểm tra hàng loạt xem các phim (theo slug + nguồn) có trailer hay
    // không, dùng cho nút lọc "Chỉ phim có trailer" trên trang chủ. Giới hạn
    // số lượng gọi song song (6) để tránh dội quá nhiều request cùng lúc lên
    // API ngoài (OPhim/KKPhim) khi người dùng bật lọc trên trang có nhiều
    // phim, và giới hạn tối đa 60 phim/lần gọi để tránh lạm dụng endpoint.
    @PostMapping("/trailer-check")
    public ResponseEntity<Map<String, Boolean>> checkTrailers(@RequestBody(required = false) TrailerCheckRequest body) {
        if (body == null || body.items == null || body.items.isEmpty()) {
            return ResponseEntity.ok(Map.of());
        }

        List<TrailerCheckItem> items = body.items.size() > 60 ? body.items.subList(0, 60) : body.items;

        Map<String, Boolean> result = Flux.fromIterable(items)
                .flatMap(item -> movieService.hasTrailer(item.slug, item.source)
                        .map(has -> Map.entry(item.slug + "|" + (item.source == null ? "ophim" : item.source), has)),
                        6)
                .collectMap(Map.Entry::getKey, Map.Entry::getValue)
                .block();

        return ResponseEntity.ok(result);
    }
}
