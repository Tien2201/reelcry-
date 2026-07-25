package com.example.reelcry.service;

import com.example.reelcry.dto.MovieResponse;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test thuần Java cho mergeAndSort() - hàm gộp danh sách phim từ OPhim +
 * KKPhim, loại trùng theo slug, sắp xếp theo thời gian cập nhật mới nhất.
 * Không cần Spring context hay gọi API thật, chỉ new trực tiếp MovieService
 * với 1 WebClient.Builder rỗng (mergeAndSort không dùng tới webClient).
 */
class MovieServiceMergeTest {

    private final MovieService service = new MovieService(WebClient.builder());

    private MovieResponse.MovieItem item(String slug, String modifiedTime) {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setSlug(slug);
        item.setName("Phim " + slug);
        if (modifiedTime != null) {
            MovieResponse.ModifiedInfo modified = new MovieResponse.ModifiedInfo();
            modified.setTime(modifiedTime);
            item.setModified(modified);
        }
        return item;
    }

    @Test
    void ganDungNguonChoTungItem() {
        List<MovieResponse.MovieItem> ophim = List.of(item("phim-a", "2026-01-01T00:00:00.000Z"));
        List<MovieResponse.MovieItem> kkphim = List.of(item("phim-b", "2026-01-02T00:00:00.000Z"));

        List<MovieResponse.MovieItem> merged = service.mergeAndSort(ophim, kkphim);

        assertEquals(2, merged.size());
        assertEquals("ophim", merged.stream().filter(i -> i.getSlug().equals("phim-a")).findFirst().get().getSource());
        assertEquals("kkphim", merged.stream().filter(i -> i.getSlug().equals("phim-b")).findFirst().get().getSource());
    }

    @Test
    void trungSlugGiuaOphimVaKkphim_chiGiuBanOphim() {
        // Cùng 1 slug xuất hiện ở cả 2 nguồn -> chỉ giữ lại bản đầu tiên gặp
        // (OPhim được thêm vào trước KKPhim trong mergeAndSort)
        List<MovieResponse.MovieItem> ophim = List.of(item("phim-trung", "2026-01-01T00:00:00.000Z"));
        List<MovieResponse.MovieItem> kkphim = List.of(item("phim-trung", "2026-01-02T00:00:00.000Z"));

        List<MovieResponse.MovieItem> merged = service.mergeAndSort(ophim, kkphim);

        assertEquals(1, merged.size());
        assertEquals("ophim", merged.get(0).getSource());
    }

    @Test
    void sapXepTheoThoiGianCapNhatMoiNhatTruoc() {
        List<MovieResponse.MovieItem> ophim = new ArrayList<>(List.of(
                item("phim-cu", "2026-01-01T00:00:00.000Z"),
                item("phim-moi", "2026-01-05T00:00:00.000Z")));

        List<MovieResponse.MovieItem> merged = service.mergeAndSort(ophim, List.of());

        assertEquals("phim-moi", merged.get(0).getSlug());
        assertEquals("phim-cu", merged.get(1).getSlug());
    }

    @Test
    void itemKhongCoModified_xepXuongCuoi() {
        List<MovieResponse.MovieItem> ophim = List.of(
                item("phim-co-thoi-gian", "2026-01-01T00:00:00.000Z"),
                item("phim-khong-thoi-gian", null));

        List<MovieResponse.MovieItem> merged = service.mergeAndSort(ophim, List.of());

        assertEquals("phim-co-thoi-gian", merged.get(0).getSlug());
        assertEquals("phim-khong-thoi-gian", merged.get(1).getSlug());
    }

    @Test
    void danhSachRong_traVeDanhSachRong() {
        List<MovieResponse.MovieItem> merged = service.mergeAndSort(List.of(), List.of());
        assertTrue(merged.isEmpty());
    }

    @Test
    void motBenNull_khongLoi() {
        List<MovieResponse.MovieItem> merged = service.mergeAndSort(null, List.of(item("phim-a", "2026-01-01T00:00:00.000Z")));
        assertEquals(1, merged.size());
    }
}
