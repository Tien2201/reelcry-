// src/main/java/com/example/reelcry/entity/WatchHistory.java
package com.example.reelcry.entity;

import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "watch_history")
@CompoundIndex(name = "username_slug_idx", def = "{'username': 1, 'movieSlug': 1}", unique = true)
@Getter
@Setter
@NoArgsConstructor
public class WatchHistory {

    @Id
    private String id;

    private String username;
    private String movieSlug;
    private String movieName;
    private String movieImage;
    private Instant watchedAt;
}