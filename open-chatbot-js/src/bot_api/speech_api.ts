import { Browser } from 'puppeteer';
import { settings } from '../settings.js';

import { fileToBase64 } from '../utils/conversion_utils.js';

type AudioSamples = { chatReady: string; chatThinking: string };

export class SpeechApi {
    browser: Browser;
    audioSamples: AudioSamples;

    constructor(browser: Browser) {
        this.browser = browser;
        this.audioSamples = {
            chatReady: fileToBase64(settings.audio_files.chat_ready, 'audio/ogg'),
            chatThinking: fileToBase64(settings.audio_files.chat_thinking, 'audio/ogg'),
        };
    }

    async speak(text: string) {
        const [page] = await this.browser.pages();
        await page.evaluate(
            async (text, locale) => {
                // Open speech synth
                const synth = window.speechSynthesis;

                // Prepare the message
                const msg = new SpeechSynthesisUtterance(text);
                msg.lang = locale;
                msg.rate = 1.0;
                // We could change voice but choices are so limited - autoselect ftw.
                //const voices = speechSynthesis.getVoices();
                //msg.voice = voices[3];

                // SPEAK
                synth.speak(msg);

                // Workaround for speech just stopping and blocking
                const keepAlive = setInterval(() => {
                    if (synth.speaking) {
                        synth.pause();
                        synth.resume();
                    } else {
                        clearInterval(keepAlive);
                    }
                }, 5000);

                // Wait until complete
                await new Promise(resolve => {
                    msg.onend = resolve;
                });
            },
            text,
            settings.locale
        );
    }

    async listen(triggerWord: string | null, timeoutMs: number): Promise<string> {
        const [page] = await this.browser.pages();

        return page.evaluate(
            async (triggerWord, settings, audioSamples, timeoutMs) => {
                async function listenOnPage(
                    triggerWord: string | null,
                    settings: any,
                    audioSamples: AudioSamples,
                    timeoutMs: number
                ): Promise<string> {
                    return new Promise<string>(resolve => {
                        let timeout: NodeJS.Timeout;

                        function resetTimeout(): void {
                            if (timeout != null) {
                                clearTimeout(timeout);
                            }
                            timeout = setTimeout(() => {
                                resolve('');
                            }, timeoutMs);
                        }

                        const recognizer = createSpeechRecognizer();
                        let heardTriggerWord = false;
                        let transcript = '';
                        let recognitionStopped = false;

                        if (triggerWord != null) {
                            triggerWord = triggerWord.trim().replace(' ', '').toLowerCase();
                        }

                        recognizer.onstart = logStartListening;
                        recognizer.onresult = handleRecognitionResult;
                        recognizer.onerror = handleError;
                        recognizer.onend = handleRecognitionEnd;

                        recognizer.start();

                        function createSpeechRecognizer() {
                            // eslint-disable-next-line
                            // @ts-ignore
                            const recognizer = new webkitSpeechRecognition();
                            recognizer.lang = settings.locale;
                            recognizer.continuous = true;
                            recognizer.interimResults = true;
                            recognizer.maxAlternatives = 1;
                            return recognizer;
                        }

                        function logStartListening(): void {
                            console.log('Started listening...');
                        }

                        async function handleRecognitionResult(event: any): Promise<void> {
                            const result = event.results[event.resultIndex][0];
                            transcript = result.transcript
                                .trim()
                                .replace(' ', '')
                                .toLowerCase() as string;
                            resetTimeout();
                            if (triggerWord != null && !heardTriggerWord) {
                                if (transcript.startsWith(triggerWord)) {
                                    heardTriggerWord = true;
                                    console.log(`Heard trigger word: ${transcript}`);
                                    await playAudioSample(audioSamples.chatReady);
                                    transcript = '';
                                }
                            } else {
                                if (transcript.length > 0 && transcript != triggerWord) {
                                    const result = event.results[event.resultIndex];
                                    const isFinal = result.isFinal == true;
                                    console.log(`Heard: ${transcript}${isFinal ? '.' : '...'}`);

                                    // Stop recognition when user stops speaking
                                    if (isFinal && !recognitionStopped) {
                                        recognitionStopped = true;
                                        recognizer.stop();
                                        await playAudioSample(audioSamples.chatThinking);
                                    }
                                }
                            }
                        }

                        function handleError(event: any): void {
                            console.error(`ERROR: ${event.error}`);
                            resolve('');
                        }

                        function handleRecognitionEnd(): void {
                            if (transcript.length > 0 && transcript != triggerWord) {
                                resolve(transcript);
                            } else {
                                resolve('');
                            }
                        }

                        async function playAudioSample(sample: string) {
                            try {
                                const response = await fetch(sample);
                                const blob = await response.blob();
                                const audio = new Audio();
                                audio.src = URL.createObjectURL(blob);
                                await audio.play();
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    });
                }
                return await listenOnPage(triggerWord, settings, audioSamples, timeoutMs);
            },
            triggerWord,
            settings,
            this.audioSamples,
            timeoutMs
        );
    }
}
