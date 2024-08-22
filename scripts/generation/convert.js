const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const mathjax = require('mathjax-node');

mathjax.config({
    MathJax: {
        tex: { packages: ['base'] },
        svg: { fontCache: 'global' }
    }
});

mathjax.start();

// Check if verbose mode is enabled from command-line arguments
const verbose = process.argv.includes('--verbose');

function getLineNumber(inputHtml, searchIndex) {
    const lines = inputHtml.slice(0, searchIndex).split('\n');
    return lines.length;
}

async function convertMathToMathML(inputFile, outputFile) {
    const inputHtml = fs.readFileSync(inputFile, 'utf8');
    const dom = new JSDOM(inputHtml);
    let document = dom.window.document;

    let htmlContent = document.body.innerHTML;

    // Regular expressions to match LaTeX
    const inlineMathRegex = /\\\((.*?)\\\)/gs; // Matches \( ... \)
    const displayMathRegex = /\\\[(.*?)\\\]/gs; // Matches \[ ... \]

    let conversions = [];
    let replacements = [];

    // Function to handle conversion and error reporting
    function handleConversion(tex, format, originalMatch, matchStartIndex) {
        return new Promise((resolve, reject) => {
            mathjax.typeset({
                math: tex,
                format: format,
                mml: true
            }, function (data) {
                if (data.errors) {
                    const lineNumber = getLineNumber(inputHtml, matchStartIndex);

                    console.error(`Error in file: ${inputFile}`);
                    console.error(`Line Number: ${lineNumber}`);
                    console.error(`LaTeX Source: ${tex}`);
                    console.error(`Error: ${data.errors}`);
                    reject(data.errors);
                } else {
                    const mathML = `<math xmlns="http://www.w3.org/1998/Math/MathML">${data.mml}</math>`;
                    if (verbose) {
                        const lineNumber = getLineNumber(inputHtml, matchStartIndex);
                        console.log(`Converted LaTeX (line ${lineNumber}): ${tex}`);
                        console.log(`MathML: ${mathML}`);
                    }
                    resolve({ start: matchStartIndex, length: originalMatch.length, replacement: mathML });
                }
            });
        });
    }

    // Function to process LaTeX matches
    function processMathMatches(regex, format) {
        let match;
        while ((match = regex.exec(htmlContent)) !== null) {
            const [fullMatch, tex] = match;
            const matchStartIndex = match.index;
            conversions.push(handleConversion(tex, format, fullMatch, matchStartIndex));
        }
    }

    // Process inline and display math
    processMathMatches(inlineMathRegex, 'inline-TeX');
    processMathMatches(displayMathRegex, 'TeX');

    // Wait for all conversions to finish and collect replacements
    const results = await Promise.all(conversions);
    results.forEach(({ start, length, replacement }) => {
        replacements.push({ start, length, replacement });
    });

    // Sort replacements in reverse order of starting index
    replacements.sort((a, b) => b.start - a.start);

    // Apply replacements in reverse order
    replacements.forEach(({ start, length, replacement }) => {
        htmlContent = htmlContent.substring(0, start) + replacement + htmlContent.substring(start + length);
    });

    // Update the document's body with the converted content
    document.body.innerHTML = htmlContent;

    // Write the updated content to the output file
    fs.writeFileSync(outputFile, dom.serialize());
    console.log('Conversion complete. Output saved to', outputFile);
}

function processHtmlFiles(sourceDir, generatedDir, excludedDirs = []) {
    if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir, { recursive: true });
    }

    fs.readdirSync(sourceDir).forEach((file) => {
        const sourceFilePath = path.join(sourceDir, file);
        const generatedFilePath = path.join(generatedDir, file);

        if (fs.lstatSync(sourceFilePath).isDirectory()) {
            if (excludedDirs.includes(file)) {
                console.log(`Skipping directory: ${file}`);
                return; // Skip this directory
            }
            // Recursively process subdirectories
            processHtmlFiles(sourceFilePath, generatedFilePath, excludedDirs);
        } else if (path.extname(file) === '.html') {
            // Convert the HTML file
            convertMathToMathML(sourceFilePath, generatedFilePath);
        }
    });
}

// Example usage
const sourceDirectory = '../../html';
const generatedDirectory = '../../generated';
const excludedDirectories = ['searching']; // Add directory names to exclude

processHtmlFiles(sourceDirectory, generatedDirectory, excludedDirectories);
