package com.example.reelcry.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

// Dữ liệu từ nguồn NguonC (phim.nguonc.com). Cấu trúc JSON khác KKPhim nên
// được đổi sang MovieResponse / MovieDetailResponse sẵn có (toMovieItem,
// toDetailResponse) để template và controller dùng chung, không phải viết lại.
@Data
public class NguoncResponse {
    private String status;
    private Paginate paginate;
    private Cat cat;
    private List<Film> items;
    // Chỉ có ở API chi tiết phim (/api/film/{slug})
    private Film movie;

    public static final String SOURCE = "nguonc";

    @Data
    public static class Paginate {
        private int current_page;
        private int total_page;
    }

    @Data
    public static class Cat {
        private String name;
        private String title;
    }

    @Data
    public static class Film {
        private String name;
        private String original_name;
        private String slug;
        private String year;
        private String description;
        private Integer total_episodes;
        private String current_episode;
        private String time;
        private String quality;
        private String language;
        private String director;
        private String casts;
        private String thumb_url;
        private String thumb_url_webp;
        private String poster_url;
        private String poster_url_webp;
        private String modified;
        // {"1": {"group": {"name": "Thể loại"}, "list": [{"name": "Hành Động"}]}, ...}
        private JsonNode category;
        private List<Server> episodes;
    }

    @Data
    public static class Server {
        private String server_name;
        private List<Episode> items;
    }

    @Data
    public static class Episode {
        private String name;
        private String slug;
        private String embed;
    }

    public List<MovieResponse.MovieItem> toMovieItems() {
        if (items == null) return List.of();
        return items.stream().map(NguoncResponse::toMovieItem).collect(Collectors.toList());
    }

    public static MovieResponse.MovieItem toMovieItem(Film f) {
        MovieResponse.MovieItem item = new MovieResponse.MovieItem();
        item.setName(f.getName());
        item.setSlug(f.getSlug());
        // Ưu tiên bản WebP (nhẹ hơn ~30%). Ảnh NguonC là link tuyệt đối nên
        // getImageUrl() trả về nguyên link, không ghép thêm domain
        item.setThumb_url(firstNonBlank(f.getThumb_url_webp(), f.getThumb_url()));
        item.setPoster_url(firstNonBlank(f.getPoster_url_webp(), f.getPoster_url()));
        item.setYear(parseYear(f.getYear()));
        item.setEpisode_current(f.getCurrent_episode());
        item.setQuality(f.getQuality());
        item.setLang(f.getLanguage());
        if (f.getModified() != null) {
            MovieResponse.ModifiedInfo modified = new MovieResponse.ModifiedInfo();
            modified.setTime(f.getModified());
            item.setModified(modified);
        }
        item.setSource(SOURCE);
        return item;
    }

    public MovieDetailResponse toDetailResponse() {
        MovieDetailResponse res = new MovieDetailResponse();
        if (movie == null) return res;
        Film f = movie;

        MovieDetailResponse.MovieItem m = new MovieDetailResponse.MovieItem();
        m.setName(f.getName());
        m.setOrigin_name(f.getOriginal_name());
        m.setSlug(f.getSlug());
        m.setContent(f.getDescription());
        m.setThumb_url(firstNonBlank(f.getThumb_url_webp(), f.getThumb_url()));
        m.setPoster_url(firstNonBlank(f.getPoster_url_webp(), f.getPoster_url()));
        m.setYear(parseYear(f.getYear()));
        m.setTime(f.getTime());
        m.setQuality(f.getQuality());
        m.setLang(f.getLanguage());
        m.setEpisode_current(f.getCurrent_episode());
        m.setEpisode_total(f.getTotal_episodes() != null ? String.valueOf(f.getTotal_episodes()) : null);
        m.setCategory(categoryGroup(f.getCategory(), "Thể loại"));
        m.setCountry(categoryGroup(f.getCategory(), "Quốc gia"));
        m.setActor(splitNames(f.getCasts()));
        m.setDirector(splitNames(f.getDirector()));

        List<MovieDetailResponse.EpisodeServer> servers = new ArrayList<>();
        if (f.getEpisodes() != null) {
            for (Server s : f.getEpisodes()) {
                if (s.getItems() == null || s.getItems().isEmpty()) continue;
                MovieDetailResponse.EpisodeServer server = new MovieDetailResponse.EpisodeServer();
                server.setServer_name(s.getServer_name());
                server.setServer_data(s.getItems().stream().map(e -> {
                    MovieDetailResponse.ServerData d = new MovieDetailResponse.ServerData();
                    // NguonC đặt tên tập chỉ là số ("1", "2"...) -> thêm chữ "Tập"
                    d.setName(e.getName() != null && e.getName().matches("\\d+") ? "Tập " + e.getName() : e.getName());
                    d.setSlug(e.getSlug());
                    d.setLink_embed(e.getEmbed());
                    return d;
                }).collect(Collectors.toList()));
                servers.add(server);
            }
        }

        res.setStatus("success".equalsIgnoreCase(status) ? "success" : status);
        res.setMovieKK(m);
        res.setEpisodesKK(servers);
        return res;
    }

    // NguonC không trả slug cho thể loại/quốc gia, chỉ có tên -> tự tạo slug
    // theo cùng quy ước với KKPhim ("Hành Động" -> "hanh-dong") để link lọc
    // /filter/the-loai/{slug} vẫn dùng được
    private static List<MovieDetailResponse.CategoryItem> categoryGroup(JsonNode category, String groupName) {
        List<MovieDetailResponse.CategoryItem> result = new ArrayList<>();
        if (category == null) return result;
        for (JsonNode group : category) {
            String name = group.path("group").path("name").asText("");
            // So sánh qua slug để không lệch do khác kiểu mã hoá dấu tiếng Việt
            if (!slugify(groupName).equals(slugify(name))) continue;
            for (JsonNode entry : group.path("list")) {
                String itemName = entry.path("name").asText("");
                if (itemName.isBlank()) continue;
                MovieDetailResponse.CategoryItem c = new MovieDetailResponse.CategoryItem();
                c.setName(itemName);
                c.setSlug(slugify(itemName));
                result.add(c);
            }
        }
        return result;
    }

    static String slugify(String text) {
        String s = text.trim().toLowerCase().replace('đ', 'd');
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return s.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    private static List<String> splitNames(String text) {
        if (text == null || text.isBlank()) return List.of();
        return Arrays.stream(text.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    private static int parseYear(String year) {
        try {
            return year == null ? 0 : Integer.parseInt(year.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }
}
