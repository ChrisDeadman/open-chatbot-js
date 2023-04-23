# Put models here, e.g.:

```
wget -O gpt4all-lora-quantized-ggjt.bin https://huggingface.co/LLukas22/gpt4all-lora-quantized-ggjt/resolve/main/ggjt-model.bin
```

## Convert a model:

```
wget -O llama_tokenizer.bin https://huggingface.co/decapoda-research/llama-7b-hf/resolve/main/tokenizer.model
pyllamacpp-convert-gpt4all <model_to_convert> llama_tokenizer.bin <converted_model>
```
