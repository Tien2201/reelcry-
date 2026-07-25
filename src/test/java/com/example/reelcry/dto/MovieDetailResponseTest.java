package com.example.reelcry.dto;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test thuần Java cho MovieDetailResponse - đặc biệt là logic phân biệt 2
 * dạng JSON khác nhau giữa OPhim (episodes lồng trong item) và KKPhim
 * (episodes nằm ngoài cùng, ngang hàng với movie). Đây chính là nguyên nhân
 * gây lỗi "nút Xem ngay chỉ là chữ" đã sửa trước đó trong phiên làm việc.
 */
class MovieDetailResponseTest {

    @Test
    void isSuccess_booleanTrue_traVeTrue() {
        MovieDetailResponse res = new MovieDetailResponse();
        res.setStatus(Boolean.TRUE);
        assertTrue(res.isSuccess());
    }

    @Test
    void isSuccess_stringSuccess_traVeTrue() {
        MovieDetailResponse res = new MovieDetailResponse();
        res.setStatus("success");
        assertTrue(res.isSuccess());
    }

    @Test
    void isSuccess_stringFalse_traVeFalse() {
        MovieDetailResponse res = new MovieDetailResponse();
        res.setStatus("false");
        assertFalse(res.isSuccess());
    }

    @Test
    void isSuccess_statusNull_traVeFalse() {
        MovieDetailResponse res = new MovieDetailResponse();
        assertFalse(res.isSuccess());
    }

    @Test
    void getActualItem_dangKKPhim_layTuFieldMovie() {
        MovieDetailResponse res = new MovieDetailResponse();
        MovieDetailResponse.MovieItem movie = new MovieDetailResponse.MovieItem();
        movie.setSlug("phim-kkphim");
        res.setMovieKK(movie);

        assertNotNull(res.getActualItem());
        assertEquals("phim-kkphim", res.getActualItem().getSlug());
    }

    @Test
    void getActualItem_dangOPhim_layTuData_item() {
        MovieDetailResponse res = new MovieDetailResponse();
        MovieDetailResponse.MovieItem movie = new MovieDetailResponse.MovieItem();
        movie.setSlug("phim-ophim");
        MovieDetailResponse.MovieDetailData data = new MovieDetailResponse.MovieDetailData();
        data.setItem(movie);
        res.setData(data);

        assertNotNull(res.getActualItem());
        assertEquals("phim-ophim", res.getActualItem().getSlug());
    }

    @Test
    void getActualEpisodes_dangKKPhim_episodesNamNgoaiCungKhongLongTrongMovie() {
        MovieDetailResponse res = new MovieDetailResponse();

        // Đúng shape KKPhim thực tế: "episodes" là field ngang hàng với "movie",
        // KHÔNG nằm trong movie.episodes
        MovieDetailResponse.MovieItem movie = new MovieDetailResponse.MovieItem();
        movie.setSlug("phim-kkphim");
        res.setMovieKK(movie);

        MovieDetailResponse.EpisodeServer server = new MovieDetailResponse.EpisodeServer();
        server.setServer_name("Vietsub");
        res.setEpisodesKK(List.of(server));

        List<MovieDetailResponse.EpisodeServer> episodes = res.getActualEpisodes();
        assertNotNull(episodes);
        assertEquals(1, episodes.size());
        assertEquals("Vietsub", episodes.get(0).getServer_name());
    }

    @Test
    void getActualEpisodes_dangOPhim_episodesLongTrongItem() {
        MovieDetailResponse res = new MovieDetailResponse();

        MovieDetailResponse.EpisodeServer server = new MovieDetailResponse.EpisodeServer();
        server.setServer_name("Vietsub #1");

        MovieDetailResponse.MovieItem movie = new MovieDetailResponse.MovieItem();
        movie.setSlug("phim-ophim");
        movie.setEpisodes(List.of(server));

        MovieDetailResponse.MovieDetailData data = new MovieDetailResponse.MovieDetailData();
        data.setItem(movie);
        res.setData(data);

        List<MovieDetailResponse.EpisodeServer> episodes = res.getActualEpisodes();
        assertNotNull(episodes);
        assertEquals(1, episodes.size());
        assertEquals("Vietsub #1", episodes.get(0).getServer_name());
    }

    @Test
    void getActualEpisodes_khongCoDuLieu_traVeNull() {
        MovieDetailResponse res = new MovieDetailResponse();
        assertNull(res.getActualEpisodes());
    }
}
