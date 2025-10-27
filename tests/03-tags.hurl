# Test tags list for alpine with auth
GET http://localhost:5001/v2/alpine/tags/list
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
jsonpath "$.name" == "alpine"
jsonpath "$.tags" isCollection
jsonpath "$.tags" contains "latest"
jsonpath "$.tags" contains "3.18"
jsonpath "$.tags" contains "3.17"

# Test tags list with pagination (n=2)
GET http://localhost:5001/v2/alpine/tags/list?n=2
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
header "Link" exists
jsonpath "$.tags" count == 2

# Test tags list for non-existent repository
GET http://localhost:5001/v2/nonexistent/tags/list
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 404
[Asserts]
jsonpath "$.errors[0].code" == "NAME_UNKNOWN"
jsonpath "$.errors[0].message" == "repository not found"

# Test tags list with invalid n parameter
GET http://localhost:5001/v2/alpine/tags/list?n=0
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 400
[Asserts]
jsonpath "$.errors[0].code" == "PAGINATION_NUMBER_INVALID"
