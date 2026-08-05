package com.example.reelcry.controller;

import com.example.reelcry.dto.CategoryResponse.CategoryItem;
import com.example.reelcry.entity.Favorite;
import com.example.reelcry.repository.FavoriteRepository;
import com.example.reelcry.service.MovieService;
import org.springframework.security.core.Authentication;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;
import com.example.reelcry.dto.CategoryResponse;

// HAI DÒNG NÀY CỰC KỲ QUAN TRỌNG - KHÔNG ĐƯỢC THIẾU
import java.util.List;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;

@ControllerAdvice
public class GlobalControllerAdvice {

    private final MovieService movieService;
    private final FavoriteRepository favoriteRepository;

    public GlobalControllerAdvice(MovieService movieService, FavoriteRepository favoriteRepository) {
        this.movieService = movieService;
        this.favoriteRepository = favoriteRepository;
    }

    @ModelAttribute
    public void addAttributes(Model model, Authentication authentication) {
        try {
            // Dùng Mono.zip để gọi cả 2 API cùng lúc (Song song)
            reactor.core.publisher.Mono.zip(
                    movieService.getGenres().onErrorReturn(new CategoryResponse()),
                    movieService.getCountries().onErrorReturn(new CategoryResponse())
            ).map(tuple -> {
                CategoryResponse genresRes = tuple.getT1();
                CategoryResponse countriesRes = tuple.getT2();

                model.addAttribute("allGenres", (genresRes != null && genresRes.getData() != null)
                        ? genresRes.getData().getItems() : Collections.emptyList());
                model.addAttribute("allCountries", (countriesRes != null && countriesRes.getData() != null)
                        ? countriesRes.getData().getItems() : Collections.emptyList());
                return tuple;
            }).block(); // Chỉ block 1 lần duy nhất cho cả 2 kết quả
        } catch (Exception e) {
            model.addAttribute("allGenres", Collections.emptyList());
            model.addAttribute("allCountries", Collections.emptyList());
        }

        // Danh sách slug phim đã yêu thích của người dùng hiện tại - để hiển thị
        // đúng trạng thái nút "+" nhanh thêm yêu thích trên mọi card phim (không
        // cần vào từng trang chi tiết mới biết đã yêu thích hay chưa)
        try {
            if (authentication != null) {
                Set<String> favSlugs = favoriteRepository.findByUsernameOrderByAddedAtDesc(authentication.getName())
                        .stream().map(Favorite::getMovieSlug).collect(Collectors.toSet());
                model.addAttribute("favoriteSlugs", favSlugs);
            } else {
                model.addAttribute("favoriteSlugs", Collections.emptySet());
            }
        } catch (Exception e) {
            model.addAttribute("favoriteSlugs", Collections.emptySet());
        }
    }
}