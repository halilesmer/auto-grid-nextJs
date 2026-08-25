# src/components/header.py
import streamlit as st
import os
from pathlib import Path


def get_current_version():
    """VERSION dosyasından en güncel sürüm numarasını okur."""
    version_file = Path(__file__).resolve().parent.parent.parent / "VERSION"
    if os.path.exists(version_file):
        try:
            with open(version_file, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return "v1.0.0"


def render_main_title():
    version = get_current_version()
    st.markdown(
        f"""
        <h2 style='text-align: left; margin-bottom: 0px;'>
            🤖 Grid Robot Dashboard <span style='font-size: 16px; color: #888;'>{version}</span>
        </h2>
        """,
        unsafe_allow_html=True,
    )
