FROM nginx:alpine

COPY . /usr/share/nginx/html

RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ =404; \
    } \
    location /css/ { \
        root /usr/share/nginx/html; \
    } \
    location /js/ { \
        root /usr/share/nginx/html; \
    } \
    location /img/ { \
        root /usr/share/nginx/html; \
    } \
}' > /etc/nginx/conf.d/default.conf