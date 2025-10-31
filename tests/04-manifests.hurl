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
GET http://localhost:5001/v2/alpine/manifests/sha256:1d47232169609e18b3bc64051bea9810984c6303662c0207868e7f851d2e10e3
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/vnd.docker.distribution.manifest.v2+json

HTTP 200
[Asserts]
header "Docker-Content-Digest" == "sha256:1d47232169609e18b3bc64051bea9810984c6303662c0207868e7f851d2e10e3"

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
