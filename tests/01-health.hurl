# Test health check endpoint
GET http://localhost:5001/v2/

HTTP 200
[Asserts]
header "Docker-Distribution-API-Version" == "registry/2.0"
