# Mail server: official Stalwart image + automatic initial setup (no web wizard required)
FROM stalwartlabs/stalwart:v0.16
USER root
RUN mkdir -p /secrets && chown stalwart:stalwart /secrets && chmod 750 /secrets
COPY --chmod=755 entrypoint.sh /usr/local/bin/uni-mail-entrypoint
USER stalwart
ENTRYPOINT ["/bin/sh", "/usr/local/bin/uni-mail-entrypoint"]
