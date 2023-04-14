function extractCharPosition(message: string): number {
    const charPattern = /\position (\d+)/;
    const match = charPattern.exec(message);
    if (match) {
        return parseInt(match[1]);
    } else {
        throw new Error('Failed to parse char position :(');
    }
}

function addQuotesToPropertyNames(jsonString: string): string {
    function replaceFunc(_substring: string, ...args: any[]): string {
        return `"${args[0].replaceAll("'", '')}":`;
    }

    const pattern = /([']*\w+[']*):/g;
    return jsonString.replace(pattern, replaceFunc);
}

function addQuotesToPropertyValues(jsonString: string): string {
    function replaceFunc(_substring: string, ...args: any[]): string {
        return `${args[0].replaceAll("'", '"')}`;
    }

    const pattern = /(:\s*['][^']+[']\s*[,{}])/g;
    return jsonString.replace(pattern, replaceFunc);
}

function balanceBraces(jsonString: string): string | null {
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

    try {
        JSON.parse(jsonString);
    } catch (error) {
        return null;
    }
    return jsonString;
}

function fixInvalidEscape(jsonStr: string, message: string): string {
    while (message.startsWith('Bad escaped character')) {
        const badEscapeLocation = extractCharPosition(message);
        jsonStr = jsonStr.slice(0, badEscapeLocation - 1) + jsonStr.slice(badEscapeLocation);

        try {
            JSON.parse(jsonStr);
            return jsonStr;
        } catch (error) {
            if (error instanceof SyntaxError) {
                message = error.message;
            } else {
                return jsonStr;
            }
        }
    }
    return jsonStr;
}

function fixTrailingCommas(jsonString: string): string {
    const pattern = /(,)\s*[}]/g;
    return jsonString.replace(pattern, '');
}

function correctJson(jsonStr: string, message: string): string {
    if (message.startsWith('Bad escaped character')) {
        jsonStr = fixInvalidEscape(jsonStr, message);
    }

    if (message.startsWith('Expected property name')) {
        jsonStr = addQuotesToPropertyNames(jsonStr);
        try {
            JSON.parse(jsonStr);
            return jsonStr;
        } catch (error) {
            // continue
        }
    }

    jsonStr = fixTrailingCommas(jsonStr);
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch (error) {
        // continue
    }

    const balancedStr = balanceBraces(jsonStr);
    if (balancedStr != null) {
        return balancedStr;
    }

    jsonStr = addQuotesToPropertyValues(jsonStr);
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch (error) {
        // continue
    }

    return jsonStr;
}

export function fixAndParseJson(jsonStr: string): any {
    // remove invalid chars
    let fixedJsonStr = jsonStr.replace('\t', '');

    // remove everything before and after the json data
    const braceIndex = fixedJsonStr.indexOf('{');
    if (braceIndex > 0) {
        fixedJsonStr = fixedJsonStr.slice(braceIndex);
    }
    const lastBraceIndex = fixedJsonStr.lastIndexOf('}');
    if (lastBraceIndex > 0) {
        fixedJsonStr = fixedJsonStr.slice(0, lastBraceIndex + 1);
    }

    try {
        return JSON.parse(fixedJsonStr);
    } catch (error) {
        if (error instanceof SyntaxError) {
            fixedJsonStr = correctJson(fixedJsonStr, error.message);
            return JSON.parse(fixedJsonStr);
        } else {
            throw error;
        }
    }
}
