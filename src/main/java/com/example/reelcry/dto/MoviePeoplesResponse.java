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
    }
}