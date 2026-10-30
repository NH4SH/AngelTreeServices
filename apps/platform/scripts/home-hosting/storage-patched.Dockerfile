# Preserve Supabase Storage's exact application and native-addon ABI. Only the
# Node executable advances within major 24 to its reviewed security release.
FROM node:24.22.1-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2 AS patched_node
FROM supabase/storage-api@sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54
COPY --from=patched_node /usr/local/bin/node /usr/local/bin/node
RUN test "$(node --version)" = v24.22.1
