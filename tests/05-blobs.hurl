# Test blob GET
GET http://localhost:5001/v2/alpine/blobs/sha256:8b9dec789401bafc9938ad587aa14a074579441ddaf31388e4abdea51567aaa3
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
header "Docker-Content-Digest" == "sha256:8b9dec789401bafc9938ad587aa14a074579441ddaf31388e4abdea51567aaa3"
header "Content-Type" == "application/octet-stream"
header "Content-Length" exists
jsonpath "$.architecture" == "amd64"
jsonpath "$.os" == "linux"

# Test blob HEAD
HEAD http://localhost:5001/v2/alpine/blobs/sha256:8b9dec789401bafc9938ad587aa14a074579441ddaf31388e4abdea51567aaa3
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Content-Digest" == "sha256:8b9dec789401bafc9938ad587aa14a074579441ddaf31388e4abdea51567aaa3"
header "Content-Length" exists

# Test blob for non-existent repository
GET http://localhost:5001/v2/nonexistent/blobs/sha256:8b9dec789401bafc9938ad587aa14a074579441ddaf31388e4abdea51567aaa3
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
