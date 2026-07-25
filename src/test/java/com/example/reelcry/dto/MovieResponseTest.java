package com.example.reelcry.dto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Test thuần Java cho logic ghép URL ảnh (getImageUrl) - không cần Spring
 * context hay kết nối mạng, chỉ kiểm tra logic if/else branching.
 */
class MovieResponseTest {

    @Test
    void getImageUrl_ophim_dungPrefixOphim() {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setThumb_url("phim-abc-thumb.jpg");
        item.setSource("ophim");

        assertEquals("https://img.ophim.live/uploads/movies/phim-abc-thumb.jpg", item.getImageUrl());
    }

    @Test
    void getImageUrl_kkphim_dungPrefixPhimimg() {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setThumb_url("upload/vod/20260101-1/abc.jpg");
        item.setSource("kkphim");

        assertEquals("https://phimimg.com/upload/vod/20260101-1/abc.jpg", item.getImageUrl());
    }

    @Test
    void getImageUrl_urlTuyetDoi_giuNguyen() {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setThumb_url("https://cdn.example.com/poster.jpg");
        item.setSource("kkphim");

        assertEquals("https://cdn.example.com/poster.jpg", item.getImageUrl());
    }

    @Test
    void getImageUrl_thumbRong_dungPosterUrl() {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setThumb_url("");
        item.setPoster_url("poster-fallback.jpg");
        item.setSource("ophim");

        assertEquals("https://img.ophim.live/uploads/movies/poster-fallback.jpg", item.getImageUrl());
    }

    @Test
    void getImageUrl_khongCoAnhNao_traVeNull() {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setSource("ophim");

        assertNull(item.getImageUrl());
    }
}
