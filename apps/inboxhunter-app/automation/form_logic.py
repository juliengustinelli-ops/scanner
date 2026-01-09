"""
Testable form automation logic - extracted for unit testing.
This module contains pure functions that can be tested without browser/Playwright.
"""

from typing import Dict, List, Any, Optional
import re


# Keywords that indicate a submit button
SUBMIT_KEYWORDS = [
    "submit", "sign up", "signup", "register", "subscribe",
    "join", "send", "continue", "next", "create", "get started"
]

# Keywords that indicate a CTA (Call-to-Action) button that navigates rather than submits
CTA_KEYWORDS = [
    "try", "learn more", "discover", "explore", "see", "view",
    "download", "get access", "start free", "book demo", "request demo"
]


def is_radio_or_checkbox_selector(selector: str) -> bool:
    """
    Check if a selector represents a radio button or checkbox element.

    These elements can trigger tracking POSTs when clicked but should NOT
    be treated as form submissions.

    Args:
        selector: CSS selector string

    Returns:
        True if the selector appears to be for a radio/checkbox element
    """
    if not selector:
        return False

    selector_lower = selector.lower()

    # Check for explicit type attributes in selector
    type_patterns = [
        "type='radio'",
        'type="radio"',
        "type='checkbox'",
        'type="checkbox"',
        "[type=radio]",
        "[type=checkbox]",
        "input[type='radio']",
        'input[type="radio"]',
        "input[type='checkbox']",
        'input[type="checkbox"]',
    ]

    return any(pattern in selector_lower for pattern in type_patterns)


def is_submit_action(
    selector: str,
    reasoning: str,
    fields_filled: List[str],
    is_cta_button: bool = False
) -> bool:
    """
    Determine if a click action is a real form submission attempt.

    A click is considered a form submit if:
    1. We have filled at least one field (we're in a form submission flow)
    2. Either: the selector/reasoning contains submit keywords OR it's not a CTA button
    3. It's NOT a radio button or checkbox

    Args:
        selector: CSS selector being clicked
        reasoning: LLM's reasoning for the action
        fields_filled: List of fields already filled in the form
        is_cta_button: Whether the button was flagged as a CTA

    Returns:
        True if this click should be treated as a form submission
    """
    if not selector:
        return False

    selector_lower = selector.lower()
    reasoning_lower = (reasoning or "").lower()

    # Check for submit keywords
    is_submit_keyword = any(
        kw in selector_lower or kw in reasoning_lower
        for kw in SUBMIT_KEYWORDS
    )

    # Check if we've filled any fields
    has_filled_fields = len(fields_filled) > 0

    # Check if this is a radio/checkbox (should not be treated as submit)
    is_radio_checkbox = is_radio_or_checkbox_selector(selector)

    # Final determination
    is_real_submit = (
        has_filled_fields and
        (is_submit_keyword or not is_cta_button) and
        not is_radio_checkbox
    )

    return is_real_submit


def should_capture_proof(
    response_received: bool,
    has_existing_proof: bool
) -> bool:
    """
    Determine if we should capture submission proof (screenshot).

    We only capture proof if:
    1. We actually received a POST/PUT response (form was submitted to server)
    2. We don't already have proof captured

    This prevents capturing screenshots of validation errors or pre-submission state.

    Args:
        response_received: Whether a POST/PUT response was received
        has_existing_proof: Whether proof has already been captured

    Returns:
        True if we should capture proof now
    """
    return response_received and not has_existing_proof


def validate_selector_exists_in_html(selector: str, html: str) -> bool:
    """
    Validate that a selector references an element that exists in the HTML.

    This helps detect hallucinated selectors from LLM responses.

    Args:
        selector: CSS selector to validate
        html: HTML content to check against

    Returns:
        True if the selector appears to reference a real element
    """
    if not selector or not html:
        return False

    html_lower = html.lower()
    selector_lower = selector.lower()

    # Handle ID selectors: #someId
    if selector.startswith("#"):
        element_id = selector[1:].split("[")[0].split(":")[0]  # Get just the ID
        # Check if id="elementId" exists in HTML
        return f'id="{element_id}"' in html_lower or f"id='{element_id}'" in html_lower

    # Handle name selectors: [name="x"] or [name='x']
    name_match = re.search(r"\[name=['\"]([^'\"]+)['\"]\]", selector_lower)
    if name_match:
        name_value = name_match.group(1)
        return f'name="{name_value}"' in html_lower or f"name='{name_value}'" in html_lower

    # Handle type selectors: input[type="email"]
    type_match = re.search(r"input\[type=['\"]([^'\"]+)['\"]\]", selector_lower)
    if type_match:
        type_value = type_match.group(1)
        return f'type="{type_value}"' in html_lower or f"type='{type_value}'" in html_lower

    # Handle has-text selectors: button:has-text("Submit")
    text_match = re.search(r":has-text\(['\"]([^'\"]+)['\"]\)", selector)
    if text_match:
        button_text = text_match.group(1).lower()
        return button_text in html_lower

    # If we can't parse the selector, assume it might be valid
    # (this is conservative - better to try than to skip)
    return True


def validate_llm_actions(actions: List[Dict[str, Any]], html: str) -> List[Dict[str, Any]]:
    """
    Validate LLM-generated actions and filter out those with invalid selectors.

    Args:
        actions: List of actions from LLM response
        html: HTML content to validate against

    Returns:
        List of actions with valid selectors (invalid ones are filtered out)
    """
    valid_actions = []

    for action in actions:
        if not isinstance(action, dict):
            continue

        action_type = action.get("action", "")
        selector = action.get("selector", "")

        # 'complete' actions don't need selectors
        if action_type == "complete":
            valid_actions.append(action)
            continue

        # For fill_field and click, validate selector
        if action_type in ["fill_field", "click"]:
            if not selector:
                continue  # Skip actions without selectors

            if validate_selector_exists_in_html(selector, html):
                valid_actions.append(action)
            # else: skip - selector appears to be hallucinated

    return valid_actions


def extract_ids_and_names_from_html(html: str) -> Dict[str, List[str]]:
    """
    Extract all id and name attributes from HTML.

    Useful for debugging and validating what elements actually exist.

    Args:
        html: HTML content to parse

    Returns:
        Dict with 'ids' and 'names' lists
    """
    ids = re.findall(r'id=["\']([^"\']+)["\']', html, re.IGNORECASE)
    names = re.findall(r'name=["\']([^"\']+)["\']', html, re.IGNORECASE)

    return {
        "ids": list(set(ids)),
        "names": list(set(names))
    }


def detect_field_type_from_attributes(
    input_type: str,
    name: str,
    placeholder: str,
    aria_label: str
) -> str:
    """
    Detect what type of data a form field expects based on its attributes.

    Args:
        input_type: The input's type attribute (email, text, tel, etc.)
        name: The input's name attribute
        placeholder: The input's placeholder text
        aria_label: The input's aria-label

    Returns:
        Detected field type (email, phone, first_name, etc.)
    """
    # Combine all attributes for pattern matching
    combined = f"{input_type} {name} {placeholder} {aria_label}".lower()

    # Check for email
    if input_type == "email" or "email" in combined:
        return "email"

    # Check for phone
    if input_type == "tel" or any(w in combined for w in ["phone", "tel", "mobile", "cell"]):
        return "phone"

    # Check for name fields
    if any(w in combined for w in ["first_name", "firstname", "first name", "fname"]):
        return "first_name"
    if any(w in combined for w in ["last_name", "lastname", "last name", "lname", "surname"]):
        return "last_name"
    if any(w in combined for w in ["full_name", "fullname", "full name", "name"]) and "first" not in combined and "last" not in combined:
        return "full_name"

    # Check for company/organization
    if any(w in combined for w in ["company", "organization", "business", "org"]):
        return "company"

    # Check for website
    if any(w in combined for w in ["website", "url", "site", "homepage"]):
        return "website"

    # Default to text
    return "text"
