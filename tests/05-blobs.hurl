# Test blob GET
GET http://localhost:5001/v2/alpine/blobs/sha256:7e01a0d0a1dcd9e539f8e9bbb4ebbf196d3f0757af8b8d1e9f7e5c0d5a5c5e8e
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
header "Docker-Content-Digest" == "sha256:7e01a0d0a1dcd9e539f8e9bbb4ebbf196d3f0757af8b8d1e9f7e5c0d5a5c5e8e"
header "Content-Type" == "application/octet-stream"
header "Content-Length" exists
jsonpath "$.architecture" == "amd64"
jsonpath "$.os" == "linux"

# Test blob HEAD
HEAD http://localhost:5001/v2/alpine/blobs/sha256:7e01a0d0a1dcd9e539f8e9bbb4ebbf196d3f0757af8b8d1e9f7e5c0d5a5c5e8e
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Content-Digest" == "sha256:7e01a0d0a1dcd9e539f8e9bbb4ebbf196d3f0757af8b8d1e9f7e5c0d5a5c5e8e"
header "Content-Length" exists

# Test blob for non-existent repository
GET http://localhost:5001/v2/nonexistent/blobs/sha256:7e01a0d0a1dcd9e539f8e9bbb4ebbf196d3f0757af8b8d1e9f7e5c0d5a5c5e8e
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 404
[Asserts]
jsonpath "$.errors[0].code" == "NAME_UNKNOWN"

# Test blob with invalid digest format
GET http://localhost:5001/v2/alpine/blobs/invalid-digest
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 400
[Asserts]
jsonpath "$.errors[0].code" == "DIGEST_INVALID"

# Test blob for non-existent digest
GET http://localhost:5001/v2/alpine/blobs/sha256:0000000000000000000000000000000000000000000000000000000000000000
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 404
[Asserts]
jsonpath "$.errors[0].code" == "BLOB_UNKNOWN"
