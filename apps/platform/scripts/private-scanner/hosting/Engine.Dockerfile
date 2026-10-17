# The official ClamAV 1.5.4 image has no arm64 manifest. Use the same pinned
# Ubuntu engine package on both host architectures; record final image IDs.
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
ARG CLAMAV_VERSION=1.5.4+dfsg-0ubuntu0.24.04.1
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod 755 /usr/sbin/policy-rc.d \
    && apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      clamav-daemon=${CLAMAV_VERSION} clamav-freshclam=${CLAMAV_VERSION} ca-certificates \
    && groupmod -g 10001 clamav && usermod -u 10001 -g 10001 clamav \
    && mkdir -p /var/lib/clamav && chown -R 10001:10001 /var/lib/clamav \
    && chmod 700 /var/lib/clamav && rm -rf /var/lib/apt/lists/*
COPY hosting/clamd.conf hosting/freshclam.conf /etc/clamav/
USER 10001:10001
CMD ["clamd", "--config-file=/etc/clamav/clamd.conf"]
