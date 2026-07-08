FROM maven:3.8.6-eclipse-temurin-17 AS build
COPY . .
RUN mvn clean package -DskipTests

# Bước 2: Chạy ứng dụng bằng JRE nhẹ hơn
FROM eclipse-temurin:17-jre-alpine
COPY --from=build /target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]