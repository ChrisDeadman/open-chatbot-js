# 🚀 `python-executor`

Docker container that provides a REST interface to execute python code in a sandboxed environment.

```
cd <root of repository>

# build
docker build -t deads-inc/python-executor python-executor

# run
docker run --rm -d -p 8080:8080 -v ./data:/data --name python-executor deads-inc/python-executor

# test
curl -X POST -H "Content-Type: text/plain" -d $'print(1+2)' http://localhost:8080/execute
```
