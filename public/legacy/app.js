const useTypedRuntime = new URLSearchParams(window.location.search).get('runtime') === 'typed';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

if (!useTypedRuntime) {
  const scripts = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    ...['app-1.js', 'app-2.js', 'app-3a.js', 'app-3b.js', 'app-4a.js', 'app-4b.js']
      .map(file => new URL(file, import.meta.url).href)
  ];

  try {
    for (const src of scripts) await loadScript(src);
  } catch (error) {
    console.error(error);
    const message = document.querySelector('#authMessage');
    if (message) message.textContent = 'The app could not finish loading. Refresh the page and check your internet connection.';
  }
}
