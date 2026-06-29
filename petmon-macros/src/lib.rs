use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, FnArg, ItemFn, LitStr, Pat, PatType, Token, Type,
};

/// Enforces that the authenticated caller has the given scope.
///
/// Placed on any async handler function, this attribute:
/// 1. Injects `_req: ::actix_web::HttpRequest` as the **first** parameter
///    (skipped if a parameter of that type already exists).
/// 2. Prepends a scope check to the function body that returns
///    `Err(AppError::Forbidden(...))` when the caller's token lacks the scope.
///
/// OIDC and Dev identities always pass. API tokens pass when their scope
/// set contains `"all"` or the required scope.
///
/// # Example
/// ```ignore
/// #[get("")]
/// #[require_scope("api_read")]
/// pub async fn list_pets(state: web::Data<AppState>) -> AppResult<HttpResponse> {
///     // ...
/// }
/// ```
#[proc_macro_attribute]
pub fn require_scope(args: TokenStream, item: TokenStream) -> TokenStream {
    let scope_arg = parse_macro_input!(args as ScopeArg);
    let scope_lit = &scope_arg.scope;
    let scope_str = scope_lit.value();

    let mut func = parse_macro_input!(item as ItemFn);

    // Check whether any existing parameter is already HttpRequest.
    let has_req_param = func.sig.inputs.iter().any(|arg| {
        if let FnArg::Typed(PatType { ty, .. }) = arg {
            type_is_http_request(ty)
        } else {
            false
        }
    });

    // Find the name of the HttpRequest param (injected or existing).
    let req_ident = if has_req_param {
        // Find the identifier of the existing HttpRequest param.
        func.sig
            .inputs
            .iter()
            .find_map(|arg| {
                if let FnArg::Typed(PatType { pat, ty, .. }) = arg {
                    if type_is_http_request(ty) {
                        if let Pat::Ident(pi) = pat.as_ref() {
                            return Some(pi.ident.clone());
                        }
                    }
                }
                None
            })
            .unwrap_or_else(|| syn::Ident::new("_req", proc_macro2::Span::call_site()))
    } else {
        // Inject a new `_scope_req` parameter as the first argument.
        let ident = syn::Ident::new("_scope_req", proc_macro2::Span::call_site());
        let new_param: FnArg = syn::parse_quote! {
            _scope_req: ::actix_web::HttpRequest
        };
        func.sig.inputs.insert(0, new_param);
        ident
    };

    // Build the guard block.
    let guard: TokenStream2 = quote! {
        {
            use ::actix_web::HttpMessage as _;
            let _identity = #req_ident
                .extensions()
                .get::<crate::auth::identity::Identity>()
                .cloned();
            match _identity {
                None => {
                    return Err(crate::error::AppError::Internal(
                        "missing identity in request".to_string(),
                    ));
                }
                Some(_id) if !_id.has_scope(#scope_str) => {
                    return Err(crate::error::AppError::Forbidden(format!(
                        "scope '{}' required",
                        #scope_str,
                    )));
                }
                _ => {}
            }
        }
    };

    // Prepend guard to the original function body.
    let orig_stmts = &func.block.stmts;
    func.block = syn::parse_quote! {
        {
            #guard
            #(#orig_stmts)*
        }
    };

    quote! { #func }.into()
}

struct ScopeArg {
    scope: LitStr,
}

impl Parse for ScopeArg {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let scope: LitStr = input.parse()?;
        // Allow trailing comma.
        let _: Option<Token![,]> = input.parse()?;
        Ok(ScopeArg { scope })
    }
}

fn type_is_http_request(ty: &Type) -> bool {
    match ty {
        Type::Path(tp) => {
            let segs: Vec<_> = tp
                .path
                .segments
                .iter()
                .map(|s| s.ident.to_string())
                .collect();
            // Matches `HttpRequest`, `actix_web::HttpRequest`, `::actix_web::HttpRequest`
            segs.last().map(|s| s == "HttpRequest").unwrap_or(false)
        }
        _ => false,
    }
}
