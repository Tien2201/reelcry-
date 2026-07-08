package com.example.reelcry.dto;

import lombok.Data;
import java.io.Serializable;
import java.util.List;

@Data
public class CategoryResponse implements Serializable {
    private static final long serialVersionUID = 1L;
    private String status;
    private String message;
    private CategoryData data;

    @Data
    public static class CategoryData implements Serializable {
        private static final long serialVersionUID = 1L;
        private List<CategoryItem> items;
    }

    @Data
    public static class CategoryItem implements Serializable {
        private static final long serialVersionUID = 1L;
        private String name;
        private String slug;
    }
}