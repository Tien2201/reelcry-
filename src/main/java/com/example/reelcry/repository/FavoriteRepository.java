package com.example.reelcry.repository;

import com.example.reelcry.entity.Favorite;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends MongoRepository<Favorite, String> {
    List<Favorite> findByUsernameOrderByAddedAtDesc(String username);
    Optional<Favorite> findByUsernameAndMovieSlug(String username, String movieSlug);
    boolean existsByUsernameAndMovieSlug(String username, String movieSlug);
    void deleteByUsernameAndMovieSlug(String username, String movieSlug);
    void deleteByUsernameAndMovieSlugIn(String username, List<String> movieSlugs);
    void deleteByUsername(String username);
}
