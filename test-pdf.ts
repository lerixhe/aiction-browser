import * as pdfjsLib from "pdfjs-dist"

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs")

async function testPdfRendering() {
  // Test with a simple PDF
  const pdfUrl = "https://raw.githubusercontent.com/nicktomlin/pdfjs-test/master/test.pdf"
  
  try {
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise
    const page = await pdf.getPage(1)
    const scale = 1.5
    const viewport = page.getViewport({ scale })
    
    console.log("Viewport:", viewport)
    console.log("RawDims:", viewport.rawDims)
    console.log("Scale:", scale)
    
    // Create container
    const container = document.createElement("div")
    container.style.position = "relative"
    container.style.width = `${viewport.width}px`
    container.style.height = `${viewport.height}px`
    document.body.appendChild(container)
    
    // Create canvas
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    container.appendChild(canvas)
    
    // Create text layer div
    const textLayerDiv = document.createElement("div")
    textLayerDiv.className = "textLayer"
    container.appendChild(textLayerDiv)
    
    // Set CSS variables
    container.style.setProperty("--scale-factor", `${scale}`)
    container.style.setProperty("--user-unit", "1")
    container.style.setProperty("--total-scale-factor", `${scale}`)
    
    // Render canvas
    const ctx = canvas.getContext("2d")!
    await page.render({ canvas, viewport }).promise
    
    // Get text content
    const textContent = await page.getTextContent()
    console.log("TextContent:", textContent)
    
    // Create text layer
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport
    })
    
    await textLayer.render()
    
    console.log("TextLayer rendered successfully")
    console.log("TextLayer divs:", textLayer.textDivs.length)
    
    // Check computed styles
    const firstSpan = textLayerDiv.querySelector("span")
    if (firstSpan) {
      const computedStyle = window.getComputedStyle(firstSpan)
      console.log("First span computed style:", {
        left: computedStyle.left,
        top: computedStyle.top,
        fontSize: computedStyle.fontSize,
        transform: computedStyle.transform
      })
    }
    
    // Check container dimensions
    const containerStyle = window.getComputedStyle(container)
    console.log("Container dimensions:", {
      width: containerStyle.width,
      height: containerStyle.height
    })
    
    // Check text layer dimensions
    const textLayerStyle = window.getComputedStyle(textLayerDiv)
    console.log("TextLayer dimensions:", {
      width: textLayerStyle.width,
      height: textLayerStyle.height
    })
    
  } catch (error) {
    console.error("Error:", error)
  }
}

// Run test
testPdfRendering()
