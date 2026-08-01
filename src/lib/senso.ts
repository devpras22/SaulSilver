export async function getPharmacyTrustContext(pharmacyName: string): Promise<{ score: number; context: string }> {
  try {
    const query = `What is the reliability score and trust context for ${pharmacyName}?`;
    
    // In a real implementation, you would hit Senso's REST API endpoint.
    // For this hackathon, since we have the Senso CLI installed on the backend, 
    // we can either use their Node SDK or just fetch the data. 
    // Here is a representative REST fetch call:
    
    const response = await fetch("https://api.senso.ai/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENSO_API_KEY}`
      },
      body: JSON.stringify({
        query: query,
        max_results: 3
      })
    });

    if (!response.ok) {
      console.error("Senso API failed:", await response.text());
      return { score: 75, context: "Default score used due to API failure." };
    }

    const data = await response.json();
    
    // Parse the score out of the answer (e.g., "95/100")
    // If not found, fallback to a default safe score.
    const answer = data.answer || "";
    const scoreMatch = answer.match(/(\d{1,3})\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) / 100 : 0.75;

    return {
      score: score,
      context: answer
    };
  } catch (error) {
    console.error("Error fetching from Senso:", error);
    return { score: 0.75, context: "Unable to verify trust context." };
  }
}
