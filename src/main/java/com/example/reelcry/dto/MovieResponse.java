package com.example.reelcry.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class MovieResponse implements Serializable {
    private static final long serialVersionUID = 1L;

    private Object status; // Để Object vì OPhim trả String "true", KKPhim trả Boolean true
    private String message;

    // --- Cấu trúc OPhim ---
    private MovieData data;

    // --- Cấu trúc KKPhim (Hứng trực tiếp nếu items nằm ngoài) ---
    @JsonProperty("items")
    private List<MovieItem> itemsKK;

    // Hàm Getter "thông minh" để Controller lấy danh sách phim không bao giờ sợ Null
    public List<MovieItem> getActualItems() {
        if (data != null && data.getItems() != null) {
            return data.getItems();
        }
        return itemsKK; // Trả về items của KKPhim nếu OPhim data null
    }

    @Data
    public static class MovieData implements Serializable {
        private static final long serialVersionUID = 1L;
        private List<MovieItem> items;
        private MovieParams params;
    }

    @Data
    public static class MovieParams implements Serializable {
        private static final long serialVersionUID = 1L;
        private String type_list;
        private String title;
        private String slug;
        private MoviePagination pagination;
    }

    @Data
    public static class MoviePagination implements Serializable {
        private static final long serialVersionUID = 1L;
        private int totalItems;
        private int totalItemsPerPage;
        private int currentPage;
        private int totalPages;
    }

    @Data
    public static class MovieItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String slug;
        private String thumb_url;
        private String poster_url; // KKPhim đôi khi dùng poster_url
        private int year;
        private String episode_current;
        private String quality;
        private String lang;
        private ModifiedInfo modified;

        // Không lấy từ JSON - tự set trong code để biết phim này lấy từ nguồn nào (ophim/kkphim)
        private transient String source;

        // Bổ sung Getter cho ảnh để dùng được cho cả 2 server
        public String getImageUrl() {
            String path = (thumb_url != null && !thumb_url.isEmpty()) ? thumb_url : poster_url;
            if (path == null || path.isEmpty()) return null;
            if (path.startsWith("http")) return path;
            if ("kkphim".equals(source)) {
                return "https://phimimg.com/" + path;
            }
            return "https://img.ophim.live/uploads/movies/" + path;
        }
    }

    @Data
    public static class ModifiedInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private String time;
    }
}