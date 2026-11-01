package com.example.reelcry.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Kiểm tra việc đổi JSON của NguonC sang DTO dùng chung (MovieItem /
 * MovieDetailResponse) - đúng shape JSON thực tế của phim.nguonc.com.
 */
class NguoncResponseTest {

    private final ObjectMapper mapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @Test
    void slugify_tiengViet() {
        assertEquals("hanh-dong", NguoncResponse.slugify("Hành Động"));
        assertEquals("han-quoc", NguoncResponse.slugify("Hàn Quốc"));
        assertEquals("dai-loan", NguoncResponse.slugify("Đài Loan"));
        assertEquals("khoa-hoc-vien-tuong", NguoncResponse.slugify("Khoa Học - Viễn Tưởng"));
    }

    @Test
    void toMovieItems_ganNguonVaUuTienAnhWebp() throws Exception {
        String json = """
                {"status":"success","items":[{"name":"Phim A","slug":"phim-a","year":"2026",
                 "current_episode":"Tập 8","quality":"HD","language":"Vietsub",
                 "thumb_url":"https://img.nguonc.com/a.png","thumb_url_webp":"https://img.nguonc.com/a.webp",
                 "modified":"2026-10-31T17:43:31.000000Z"}]}
                """;
        List<MovieResponse.MovieItem> items = mapper.readValue(json, NguoncResponse.class).toMovieItems();

        assertEquals(1, items.size());
        MovieResponse.MovieItem item = items.get(0);
        assertEquals("nguonc", item.getSource());
        assertEquals("https://img.nguonc.com/a.webp", item.getImageUrl());
        assertEquals(2026, item.getYear());
        assertEquals("Vietsub", item.getLang());
        assertEquals("2026-10-31T17:43:31.000000Z", item.getModified().getTime());
    }

    @Test
    void toDetailResponse_theLoaiQuocGiaVaTap() throws Exception {
        String json = """
                {"status":"success","movie":{"name":"Phim A","slug":"phim-a","description":"Nội dung",
                 "casts":"Diễn viên 1, Diễn viên 2","director":"Đạo diễn 1",
                 "category":{"1":{"group":{"name":"Định dạng"},"list":[{"name":"Phim bộ"}]},
                             "2":{"group":{"name":"Thể loại"},"list":[{"name":"Chính kịch"},{"name":"Tình Cảm"}]},
                             "4":{"group":{"name":"Quốc gia"},"list":[{"name":"Thái Lan"}]}},
                 "episodes":[{"server_name":"Vietsub #1","items":[{"name":"1","slug":"tap-1","embed":"https://e/1"}]},
                             {"server_name":"Rỗng","items":[]}]}}
                """;
        MovieDetailResponse res = mapper.readValue(json, NguoncResponse.class).toDetailResponse();

        assertTrue(res.isSuccess());
        var movie = res.getActualItem();
        assertEquals("Nội dung", movie.getContent());
        assertEquals(List.of("Diễn viên 1", "Diễn viên 2"), movie.getActor());
        assertEquals(2, movie.getCategory().size());
        assertEquals("chinh-kich", movie.getCategory().get(0).getSlug());
        assertEquals("thai-lan", movie.getCountry().get(0).getSlug());

        // Server không có tập nào bị bỏ qua; tên tập dạng số được thêm chữ "Tập"
        assertEquals(1, res.getActualEpisodes().size());
        var ep = res.getActualEpisodes().get(0).getServer_data().get(0);
        assertEquals("Tập 1", ep.getName());
        assertEquals("https://e/1", ep.getLink_embed());
    }
}
