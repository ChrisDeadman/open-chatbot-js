from flask import Flask, make_response, request
from langchain import LLMChain, PromptTemplate
from langchain.callbacks.base import CallbackManager
from langchain.llms import GPT4All


def build_model(model_file):
    callback_manager = CallbackManager([])
    return GPT4All(
        model=model_file,
        n_ctx=1024,
        n_threads=24,
        callback_manager=callback_manager,
        verbose=False,
    )


def build_llm_chain(model):
    return LLMChain(
        prompt=PromptTemplate(
            template="{input}\nassistent: ",
            input_variables=["input"],
        ),
        llm=model,
    )


def message_to_str(message):
    return (
        f'{message["role"]}: {message["content"]}'
        if message["role"].lower() != "user"
        else message["content"]
    )


def response_to_str(response, input_len) -> str:
    split = response[input_len:].split(":")
    if len(split) > 1:
        response = ":".join(split[1:])
    return response.strip()


app = Flask("gpt4all-rest")


@app.route("/chat", methods=["POST"])
def chat():
    try:
        model_file = request.json["model"]
        messages = request.json["messages"]

        model = build_model(model_file)
        llm_chain = build_llm_chain(model)

        input = "\n".join(map(message_to_str, messages))
        response = llm_chain.run(input)

        return response_to_str(response, len(input))
    except TypeError as e:
        return make_response(str(e), 400)
    except Exception as e:
        return make_response(str(e), 500)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000, use_reloader=False)
