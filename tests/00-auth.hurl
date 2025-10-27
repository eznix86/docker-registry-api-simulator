# Test health endpoint without auth (always allowed)
GET http://localhost:5001/v2/

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"

# Test catalog without auth (should fail when auth is enabled)
GET http://localhost:5001/v2/_catalog

HTTP 401
[Asserts]
header "WWW-Authenticate" contains "Basic"
jsonpath "$.errors[0].code" == "UNAUTHORIZED"
jsonpath "$.errors[0].message" == "authentication required"

# Test catalog with invalid credentials
GET http://localhost:5001/v2/_catalog
Authorization: Basic aW52YWxpZDppbnZhbGlk

HTTP 401
[Asserts]
jsonpath "$.errors[0].code" == "UNAUTHORIZED"

# Test catalog with valid credentials (admin:admin123)
GET http://localhost:5001/v2/_catalog
Authorization: Basic YWRtaW46YWRtaW4xMjM=

HTTP 200
[Asserts]
jsonpath "$.repositories" isCollection

# Test catalog with valid credentials (user:user123)
GET http://localhost:5001/v2/_catalog
Authorization: Basic dXNlcjp1c2VyMTIz

HTTP 200
[Asserts]
jsonpath "$.repositories" isCollection
