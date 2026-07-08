package com.example.reelcry.controller;

import com.example.reelcry.dto.CategoryResponse.CategoryItem;
import com.example.reelcry.service.MovieService;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;
import com.example.reelcry.dto.CategoryResponse;

// HAI DÒNG NÀY CỰC KỲ QUAN TRỌNG - KHÔNG ĐƯỢC THIẾU
import java.util.List;
import java.util.Collections;

@ControllerAdvice
public class GlobalControllerAdvice {

    private final MovieService movieService;

    public GlobalControllerAdvice(MovieService movieService) {
        this.movieService = movieService;
    }

    @ModelAttribute
    public void addAttributes(Model model) {
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
    }
}