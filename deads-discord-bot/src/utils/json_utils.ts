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

    // initial json correction
    jsonStr = correctJson(jsonStr);

    // multiple json objects handling
    const lines = jsonStr.split('\n').filter(l => l);
    if (lines.length > 1) {
        const objects: any[] = [];
        try {
            for (let i = 0; i < lines.length; i += 1) {
                const cLine = correctJson(lines[i]);
                const object = parse(cLine);
                objects.push(object);
            }
            if (!objects.some(item => typeof item === 'string')) {
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
        result = '';
    }

    // return original string if parsing did not work
    if (typeof result === 'string') {
        return jsonStr;
    }

    return result;
}
