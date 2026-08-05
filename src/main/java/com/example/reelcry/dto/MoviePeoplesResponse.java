package com.example.reelcry.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class MoviePeoplesResponse implements Serializable {
    private static final long serialVersionUID = 1L; // Nên có ID này
    private MoviePeoplesData data;

    @Data
    public static class MoviePeoplesData implements Serializable {
        private static final long serialVersionUID = 1L;
        // PHẢI LÀ "peoples" thì Java mới hiểu để map dữ liệu từ JSON vào
        private List<Person> peoples;
    }

    @Data
    public static class Person implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String character;
        private String profile_path;

        // TMDB cho phép hotlink trực tiếp ảnh từ image.tmdb.org (không cần qua
        // /img-proxy như ảnh poster của OPhim/KKPhim). Trả về null nếu người này
        // không có ảnh, để template tự hiện icon avatar mặc định thay thế.
        public String getProfilePhotoUrl() {
            if (profile_path == null || profile_path.isBlank()) {
                return null;
            }
            return "https://image.tmdb.org/t/p/w185" + profile_path;
        }
    }
}