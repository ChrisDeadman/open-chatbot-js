/*
        // Read URL content
        let url = urlMatch[0];
        url = url.replace('https://', '');
        if (url.endsWith('.') || url.endsWith(',') || url.endsWith(';') || url.endsWith('?')) {
            url = url.substring(0, url.length - 1);
        }
        const content = (await readUrlContent(url)) || 'EMPTY';

        // Only generate a summary if content length is big enough
        let summary = content;
        if (content.length > 500) {
            // Generate content chunks
            const chunks = [];
            const chunkSize = 4000;
            for (let i = 0; i < content.length; i += chunkSize) {
                chunks.push(content.slice(i, i + chunkSize));
            }

            // Generate a summary over all content chunks
            summary = 'Summary:\n\nLinks:';
            for (let idx = 0; idx < Math.min(4, chunks.length); idx++) {
                const chunk = chunks[idx];
                const summaryConversation = [
                    {
                        role: 'system',
                        content: `
You are a friend of the group that is refining content from a web-page which includes stories, datapoints, links and all kinds of information.\n
Update the Summary based on the Content.\n
Also update the relevant Links starting with "https://" and always keep video links.\n
Try to not forget important information in your updates.\n
${summary}\n\n
Content:\n
${chunk}`,
                    },
                ];

                // Start typing
                await channelData.channel.sendTyping();

                // Ask ChatGPT about the system response
                const summaryCompletion = await askChatGPT(summaryConversation);
                if (!summaryCompletion || summaryCompletion.content.length < 1) {
                    break;
                }

                // Update summary
                summary = summaryCompletion.content;
            }
        }

        if (summary.length > 0) {
            // Store bot response in conversation history
            channelData.addUserMessage({ role: 'system', content: `${url}:\n${summary}` });

            // respond with bot response
            respondToChannel(channelData.channel, completion.content);
        }*/
