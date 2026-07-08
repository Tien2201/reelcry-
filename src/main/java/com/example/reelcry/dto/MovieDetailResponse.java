package com.example.reelcry.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class MovieDetailResponse implements Serializable {
    private static final long serialVersionUID = 1L;

    // SỬA TẠI ĐÂY: Dùng Object để nhận cả String "success" và Boolean true/false
    private Object status;
    private String msg;

    private MovieDetailData data;

    @JsonProperty("movie")
    private MovieItem movieKK;

    @JsonProperty("episodes")
    private List<EpisodeServer> episodesKK;

    // Hàm kiểm tra thành công thông minh
    public boolean isSuccess() {
        if (status instanceof Boolean) return (Boolean) status;
        if (status instanceof String) {
            return "success".equalsIgnoreCase((String) status) || "true".equalsIgnoreCase((String) status);
        }
        return false;
    }

    @Data
    public static class MovieDetailData implements Serializable {
        private static final long serialVersionUID = 1L;
        private MovieItem item;
    }

    public MovieItem getActualItem() {
        if (movieKK != null) return movieKK;
        if (data != null) return data.getItem();
        return null;
    }

    public List<EpisodeServer> getActualEpisodes() {
        if (episodesKK != null) return episodesKK;
        if (getActualItem() != null) return getActualItem().getEpisodes();
        return null;
    }

    @Data
    public static class MovieItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String origin_name;
        private String slug;
        private String content;
        private String thumb_url;
        private String poster_url;
        private int year;
        private String time;
        private String quality;
        private String lang;
        private String episode_current;
        private String episode_total;
        private List<CategoryItem> category;
        private List<CategoryItem> country;
        private List<String> actor;
        private List<String> director;
        private List<EpisodeServer> episodes;

        public String getPosterFull() {
            if (thumb_url != null && thumb_url.startsWith("http")) return thumb_url;
            if (poster_url != null && poster_url.startsWith("http")) return poster_url;
            return "https://img.ophim.live/uploads/movies/" + thumb_url;
        }
    }

    @Data
    public static class CategoryItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String slug;
    }

    @Data
    public static class EpisodeServer implements Serializable {
        private static final long serialVersionUID = 1L;
        private String server_name;
        private List<ServerData> server_data;
    }

    @Data
    public static class ServerData implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String slug;
        private String link_embed;
    }
}