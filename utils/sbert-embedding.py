import argparse
import json
from typing import List

from sentence_transformers import SentenceTransformer


def main(sentences, model) -> List[List[float]]:
    model = SentenceTransformer(model)
    embeddings = model.encode(sentences)
    return [embedding.tolist() for embedding in embeddings]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Encode sentences using SentenceTransformer"
    )
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help=(
            "the transformer model to use.\n"
            "(e.g. 'sentence-transformers/all-mpnet-base-v2')"
        ),
    )
    parser.add_argument(
        "sentences",
        metavar="SENTENCE",
        type=str,
        nargs="+",
        help="a sentence to be encoded",
    )

    args = parser.parse_args()

    result = main(args.sentences, args.model)
    print(json.dumps(result))
