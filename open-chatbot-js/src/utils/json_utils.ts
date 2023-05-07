import { parse } from 'dirty-json';

function balanceBraces(jsonString: string): string {
    const openBracesCount = jsonString.split('{').length - 1;
    let closeBracesCount = jsonString.split('}').length - 1;

    while (openBracesCount > closeBracesCount) {
        jsonString += '}';
        closeBracesCount++;
    }

    while (closeBracesCount > openBracesCount) {
        jsonString = jsonString.slice(0, -1);
        closeBracesCount--;
    }

    return jsonString;
}

function correctJson(jsonStr: string): string {
    let jsonStartIdx = jsonStr.indexOf('[');
    let idx = jsonStr.indexOf('{');
    if (jsonStartIdx < 0 || (idx >= 0 && idx < jsonStartIdx)) {
        jsonStartIdx = idx;
    }

    let jsonEndIdx = jsonStr.lastIndexOf(']');
    idx = jsonStr.lastIndexOf('}');
    if (idx > jsonEndIdx) {
        jsonEndIdx = idx;
    }

    // remove everything before and after the json data
    if (jsonStartIdx >= 0 && jsonEndIdx >= 0) {
        jsonStr = jsonStr.slice(jsonStartIdx, jsonEndIdx + 1);
    }

    return balanceBraces(jsonStr);
}

export function fixAndParseJson(jsonStr: string): any {
    // remove invalid chars
    jsonStr = jsonStr.replace('\t', '');

    // no curly braces - no json
    if (!jsonStr.includes('{') || !jsonStr.includes('}')) {
        return jsonStr;
    }

    // split json object lines
    jsonStr = jsonStr.replace(/}\s*[,]*\s*{/g, "}\n{")

    // initial json correction
    jsonStr = correctJson(jsonStr);

    // multiple json objects handling
    const objects: any[] = [];
    const lines = jsonStr.split('\n').filter(l => l);
    if (lines.length > 1) {
        try {
            for (let i = 0; i < lines.length; i += 1) {
                const cLine = correctJson(lines[i]).trim();
                if (cLine.length >= 0) {
                    const object = parse(cLine);
                    if (typeof object != 'string') {
                        objects.push(object);
                    }
                }
            }
            // don't treat as multiple objects if only one object
            // (unless normal parsing fails later)
            if (objects.length > 1) {
                return objects;
            }
        } catch (error) {
            // don't treat as multiple objects if one has an error
        }
    }

    // normal object parsing
    let result;
    try {
        result = parse(jsonStr);
    } catch (error) {
        result = objects;
    }

    // return original string if parsing did not work
    if (typeof result === 'string') {
        return jsonStr;
    }

    return result;
}
