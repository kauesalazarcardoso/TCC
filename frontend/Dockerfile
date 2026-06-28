FROM nginx:alpine

COPY . /usr/share/nginx/html

RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    location = / { return 302 $scheme://$http_host/html/index.html; } \
    location = /html/estabelecimento.html { return 403; } \
    location = /html/admin.html { return 403; } \
    location / { try_files $uri $uri/ =404; } \
} \
server { \
    listen 81; \
    root /usr/share/nginx/html; \
    location = / { return 302 $scheme://$http_host/html/estabelecimento.html; } \
    location = /html/admin.html { return 403; } \
    location / { try_files $uri $uri/ =404; } \
} \
server { \
    listen 82; \
    root /usr/share/nginx/html; \
    location = / { return 302 $scheme://$http_host/html/admin.html; } \
    location / { try_files $uri $uri/ =404; } \
}' > /etc/nginx/conf.d/default.conf
