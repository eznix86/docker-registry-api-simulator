# Test catalog without auth (should fail if auth is enabled)
GET http://localhost:5001/v2/_catalog

HTTP 401
[Asserts]
jsonpath "$.errors[0].code" == "UNAUTHORIZED"

# Test catalog with valid auth
GET http://localhost:5001/v2/_catalog
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
jsonpath "$.repositories" isCollection
jsonpath "$.repositories" contains "alpine"
jsonpath "$.repositories" contains "nginx"
jsonpath "$.repositories" contains "redis"
jsonpath "$.repositories" contains "postgres"

# Test catalog with pagination (n=2)
GET http://localhost:5001/v2/_catalog?n=2
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
header "Link" exists
jsonpath "$.repositories" count == 2

# Test catalog with pagination (n=2, last=alpine)
GET http://localhost:5001/v2/_catalog?n=2&last=alpine
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
jsonpath "$.repositories" count == 2
jsonpath "$.repositories" not contains "alpine"

# Test catalog with invalid n parameter
GET http://localhost:5001/v2/_catalog?n=-1
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 400
[Asserts]
jsonpath "$.errors[0].code" == "PAGINATION_NUMBER_INVALID"
