package com.example.reelcry.repository;

import com.example.reelcry.entity.WatchHistory;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface WatchHistoryRepository extends MongoRepository<WatchHistory, String> {
    List<WatchHistory> findByUsernameOrderByWatchedAtDesc(String username);
    Optional<WatchHistory> findByUsernameAndMovieSlug(String username, String movieSlug);
    void deleteByUsername(String username);
}