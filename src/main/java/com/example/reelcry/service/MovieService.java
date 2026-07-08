package com.example.reelcry.service;

import com.example.reelcry.dto.*;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Service
public class MovieService {
    private final WebClient webClient;
    private final String OPHIM_BASE = "https://ophim1.com";
    private final String KKPHIM_BASE = "https://kkphim.vip";

    public MovieService(WebClient.Builder builder) {
        this.webClient = builder
                .defaultHeader(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .defaultHeader(HttpHeaders.REFERER, "https://ophim1.com/")
                .build();
    }

    private String getBaseUrl(String source) {
        return "kkphim".equalsIgnoreCase(source) ? KKPHIM_BASE : OPHIM_BASE;
    }

    public Mono<MovieResponse> getHomeData(int page) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/danh-sach/phim-moi-cap-nhat?page=" + page).retrieve().bodyToMono(MovieResponse.class);
    }

    // Fix lỗi getDetail: nhận 2 tham số slug và source
    public Mono<MovieDetailResponse> getDetail(String slug, String source) {
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
                .onErrorResume(e -> Mono.empty());
    }

    // Fix lỗi getMoviesByFilter: nhận thêm tham số source
    public Mono<MovieResponse> getMoviesByFilter(String category, String slug, int page, String source) {
        String path = "kkphim".equalsIgnoreCase(source) ? "/v1/api/danh-sach/" : "/v1/api/";
        return webClient.get().uri(getBaseUrl(source) + path + category + "/" + slug + "?page=" + page).retrieve().bodyToMono(MovieResponse.class);
    }

    // Fix lỗi getMoviesByCountry: Thêm hàm này vào Service
    public Mono<MovieResponse> getMoviesByCountry(String countrySlug, int page) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/quoc-gia/" + countrySlug + "?page=" + page).retrieve().bodyToMono(MovieResponse.class);
    }

    // Fix lỗi getPeoples: Thêm hàm này vào Service
    public Mono<MoviePeoplesResponse> getPeoples(String slug) {
        return webClient.get().uri(OPHIM_BASE + "/v1/api/phim/" + slug + "/peoples").retrieve().bodyToMono(MoviePeoplesResponse.class)
                .onErrorReturn(new MoviePeoplesResponse());
    }

    public Mono<CategoryResponse> getGenres() { return webClient.get().uri(OPHIM_BASE + "/v1/api/the-loai").retrieve().bodyToMono(CategoryResponse.class); }
    public Mono<CategoryResponse> getCountries() { return webClient.get().uri(OPHIM_BASE + "/v1/api/quoc-gia").retrieve().bodyToMono(CategoryResponse.class); }
    public Mono<MovieResponse> searchMovies(String keyword) { return webClient.get().uri(OPHIM_BASE + "/v1/api/tim-kiem?keyword=" + keyword).retrieve().bodyToMono(MovieResponse.class); }
}