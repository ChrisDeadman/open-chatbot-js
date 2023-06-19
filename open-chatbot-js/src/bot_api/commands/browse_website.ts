import { commandToString, extractURLs } from '../../utils/parsing_utils.js';
import { CommandContext } from '../command_api.js';

export const browseWebsiteDoc = {
    summary: 'Access the internet for information on various subjects.',
    syntax: '```browseWebsite <Insert URL> <Insert search question>```',
};

export async function browseWebsite(
    commandArgs: Record<string, string>,
    commandContext: CommandContext,
    botSettings: any
): Promise<string> {
    let response = '';
    const commandContent = commandToString(commandArgs, true).trim();

    if (commandContext.botBrowser) {
        let url = commandArgs.url;
        let question = commandArgs.question;

        if (url === undefined) {
            const urls = extractURLs(commandContent);
            if (urls.length > 0) {
                url = urls[0];
            }
        }

        if (question === undefined) {
            question = commandContent;
        }

        if (url === undefined) {
            response = 'ERROR: no URL provided';
        } else if (question.length <= url.length) {
            response = 'ERROR: no question provided';
        } else {
            const pageData = await commandContext.botBrowser.getPageData(
                url,
                question,
                botSettings.language
            );
            response = pageData.summary;
        }
    } else {
        response = 'ERROR: browser is broken.';
    }
    return response;
}
