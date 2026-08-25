import streamlit as st


def inject_pwa_code():
    pwa_html = """
    <script>
        if (!document.querySelector('link[rel="manifest"]')) {
            var link = document.createElement('link');
            link.rel = 'manifest';
            link.href = '/app/static/manifest.json';
            document.head.appendChild(link);
        }

        if ('serviceWorker' in navigator) {
            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', registerSW);
            }
        }
        function registerSW() {
            navigator.serviceWorker.register('/app/static/service-worker.js')
                .then(function(reg) { console.log('PWA SW registered:', reg.scope); })
                .catch(function(err) { console.log('PWA SW error:', err); });
        }
    </script>
    """
    st.markdown(pwa_html, unsafe_allow_html=True)
