# Test manifest GET with Docker media type
GET http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
header "Docker-Content-Digest" startsWith "sha256:"
header "ETag" exists
header "Content-Type" contains "application/vnd.docker.distribution.manifest.v2+json"
jsonpath "$.schemaVersion" == 2
jsonpath "$.mediaType" == "application/vnd.docker.distribution.manifest.v2+json"
jsonpath "$.config.digest" startsWith "sha256:"

# Test manifest GET with OCI media type
GET http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.oci.image.manifest.v1+json

HTTP 200
[Asserts]
header "Content-Type" contains "application/vnd.oci.image.manifest.v1+json"
jsonpath "$.mediaType" == "application/vnd.oci.image.manifest.v1+json"

# Test manifest GET by digest
GET http://localhost:5001/v2/alpine/manifests/sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json

HTTP 200
[Asserts]
header "Docker-Content-Digest" == "sha256:c5b1261d6d3e43071626931fc004f70149baeba2c8ec672bd4f27761f8e1ad6b"

# Test manifest HEAD
HEAD http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json

HTTP 200
[Asserts]
header "Docker-Content-Digest" exists
header "ETag" exists
header "Content-Length" exists

# Test manifest with If-None-Match (should return 304)
GET http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json

HTTP 200
[Captures]
etag: header "ETag"

GET http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json
If-None-Match: {{etag}}

HTTP 304

# Test manifest with unsupported media type
GET http://localhost:5001/v2/alpine/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/unsupported+json

HTTP 406
[Asserts]
jsonpath "$.errors[0].code" == "UNSUPPORTED"

# Test manifest for non-existent repository
GET http://localhost:5001/v2/nonexistent/manifests/latest
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 404
[Asserts]
jsonpath "$.errors[0].code" == "NAME_UNKNOWN"

# Test manifest for non-existent tag
GET http://localhost:5001/v2/alpine/manifests/nonexistent
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 404
[Asserts]
jsonpath "$.errors[0].code" == "MANIFEST_UNKNOWN"
