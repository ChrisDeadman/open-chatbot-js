import concurrent.futures
import io
import os
import sys
import tempfile
import traceback

from flask import Flask, request

app = Flask(__name__)


@app.route("/execute", methods=["POST"])
def execute():
    code = request.data.decode("utf-8")
    timeout = int(request.args.get("timeout", 15))

    return execute_code_with_timeout(code, timeout)


def execute_code_with_timeout(code: str, timeout: int):
    # Create a temporary file
    temp_log_file = tempfile.NamedTemporaryFile(delete=False)

    #
    # Override os.system to redirect output to the temporary file
    #
    os_system_orig = os.system

    def os_system_logging(command):
        return os_system_orig(f"{command} > {temp_log_file.name} 2>&1")

    os.system = os_system_logging

    # Redirect standard output and standard error to a buffer
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    sys.stdout = stdout_buffer
    sys.stderr = stderr_buffer

    error = None

    # Create a ThreadPoolExecutor with 1 thread
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        # Prepare custom locals dictionary
        custom_locals = {"__name__": "__main__"}

        # execute the code_runner function in a separate thread
        future = executor.submit(exec, code, custom_locals)

        # Wait for the result with the specified timeout
        try:
            future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            error = f"Execution timed out after {timeout}s."
        except Exception:
            # Capture the exception and its traceback within the code
            exc_type, exc_value, exc_traceback = sys.exc_info()
            traceback_details = traceback.format_exception(
                exc_type, exc_value, exc_traceback, limit=5, chain=False
            )

            # remove tracebacks of this application
            for _ in range(4):
                traceback_details.pop(1)

            # Format the traceback details and include the exception message
            error = (
                "".join(traceback_details)
                .replace('File "<string>", ', "")
                .replace(", in <module>", ":")
                .strip()
            )
        finally:
            # Restore the standard output and standard error streams
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__

            # Reset os.system
            os.system = os_system_orig

            # Read the content of the temporary file
            with open(temp_log_file.name, "r") as f:
                stdout_buffer.write(f.read())

            # Remove temp. file
            temp_log_file.close()
            os.remove(temp_log_file.name)

        # Get the output from the buffer
        response = stdout_buffer.getvalue()
        error_output = stderr_buffer.getvalue()

        # If there was any error output, append it to the response
        if error_output:
            response += f"\n{error_output}"

        if error:
            response += error

        return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
