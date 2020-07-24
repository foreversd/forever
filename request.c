#include <sys/stat.h>

#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>

#include "request.h"
#include "keyvalue.h"
#include "log.h"

static int request_check_hostname(server *srv, connection *con, buffer *host) {
	enum { DOMAINLABEL, TOPLABEL } stage = TOPLABEL;
	size_t i;
	int label_len = 0;
	size_t host_len;
	char *colon;
	int is_ip = -1; /* -1 don't know yet, 0 no, 1 yes */ 
	int level = 0;
	
	UNUSED(srv);
	UNUSED(con);

	/*
	 *       hostport      = host [ ":" port ]
	 *       host          = hostname | IPv4address | IPv6address
	 *       hostname      = *( domainlabel "." ) toplabel [ "." ]
	 *       domainlabel   = alphanum | alphanum *( alphanum | "-" ) alphanum
	 *       toplabel      = alpha | alpha *( alphanum | "-" ) alphanum
	 *       IPv4address   = 1*digit "." 1*digit "." 1*digit "." 1*digit
	 *       IPv6address   = "[" ... "]"
	 *       port          = *digit
	 */
	
	/* no Host: */
	if (!host || host->used == 0) return 0;
	
	host_len = host->used - 1;
	
	/* IPv6 adress */
	if (host->ptr[0] == '[') {
		char *c = host->ptr + 1;
		int colon_cnt = 0;
		
		/* check portnumber */
		for (; *c && *c != ']'; c++) {
			if (*c == ':') {
				if (++colon_cnt > 7) {
					return -1;
				}
			} else if (!light_isxdigit(*c)) {
				return -1;
			}
		}
		
		/* missing ] */
		if (!*c) {
			return -1;
		}
		
		/* check port */
		if (*(c+1) == ':') {
			for (c += 2; *c; c++) {
				if (!light_isdigit(*c)) {
					return -1;
				}
			}
		}
		return 0;
	}
	
	if (NULL != (colon = memchr(host->ptr, ':', host_len))) {
		char *c = colon + 1;
		
		/* check portnumber */
		for (; *c; c++) {
			if (!light_isdigit(*c)) return -1;
		}
		
		/* remove the port from the host-len */
		host_len = colon - host->ptr;
	}
	
	/* Host is empty */
	if (host_len == 0) return -1;
	
	/* scan from the right and skip the \0 */
	for (i = host_len - 1; i + 1 > 0; i--) {
		char c = host->ptr[i];

		switch (stage) {
		case TOPLABEL: 
			if (c == '.') {
				/* only switch stage, if this is not the last character */
				if (i != host_len - 1) {
					if (label_len == 0) {
						return -1;
					}
					
					/* check the first character at right of the dot */
					if (is_ip == 0) {
						if (!light_isalpha(host->ptr[i+1])) {
							return -1; 
						}
					} else if (!light_isdigit(host->ptr[i+1])) {
						is_ip = 0;
					} else if ('-' == host->ptr[i+1]) {
						return -1;
					} else {
						/* just digits */
						is_ip = 1;
					}
						
					stage = DOMAINLABEL;
					
					label_len = 0;
					level++;
				} else if (i == 0) {
					/* just a dot and nothing else is evil */
					return -1;
				}
			} else if (i == 0) {
				/* the first character of the hostname */
				if (!light_isalpha(c)) {
					return -1;
				}
				label_len++;
			} else {
				if (c != '-' && !light_isalnum(c)) {
					return -1;
				}
				if (is_ip == -1) {
					if (!light_isdigit(c)) is_ip = 0;
				}
				label_len++;
			}
			
			break;
		case DOMAINLABEL:
			if (is_ip == 1) {
				if (c == '.') {
					if (label_len == 0) {
						return -1;
					}
					
					label_len = 0;
					level++;
				} else if (!light_isdigit(c)) {
					return -1;
				} else {
					label_len++;
				}
			} else {
				if (c == '.') {
					if (label_len == 0) {
						return -1;
					}
					
					/* c is either - or alphanum here */
					if ('-' == host->ptr[i+1]) {
						return -1;
					}
					
					label_len = 0;
					level++;
				} else if (i == 0) {
					if (!light_isalnum(c)) {
						return -1;
					}
					label_len++;
				} else {
					if (c != '-' && !light_isalnum(c)) {
						return -1;
					}
					label_len++;
				}
			}
			
			break;
		}
	}
	
	/* a IP has to consist of 4 parts */
	if (is_ip == 1 && level != 3) {
		return -1;
	}
	
	if (label_len == 0) {
		return -1;
	}
	
	return 0;
}

#if 0
#define DUMP_HEADER
#endif

int http_request_split_value(array *vals, buffer *b) {
	char *s;
	size_t i;
	int state = 0;
	/*  
	 * parse 
	 * 
	 * val1, val2, val3, val4
	 * 
	 * into a array (more or less a explode() incl. striping of whitespaces
	 */
	
	if (b->used == 0) return 0;
	
	s = b->ptr;
	
	for (i =0; i < b->used - 1; ) {
		char *start = NULL, *end = NULL;
		data_string *ds;
		
		switch (state) {
		case 0: /* ws */
			
			/* skip ws */
			for (; (*s == ' ' || *s == '\t') && i < b->used - 1; i++, s++);
			
			
			state = 1;
			break;
		case 1: /* value */
			start = s;
			
			for (; *s != ',' && i < b->used - 1; i++, s++);
			end = s - 1;
			
			for (; (*end == ' ' || *end == '\t') && end > start; end--);
			
			if (NULL == (ds = (data_string *)array_get_unused_element(vals, TYPE_STRING))) {
				ds = data_string_init();
			}

			buffer_copy_string_len(ds->value, start, end-start+1);
			array_insert_unique(vals, (data_unset *)ds);
			
			if (*s == ',') {
				state = 0;
				i++;
				s++;
			} else {
				/* end of string */
				
				state = 2;
			}
			break;
		default:
			i++;
			break;
		}
	}
	return 0;
}

int request_uri_is_valid_char(char c) {
	/* RFC 2396 - Appendix A */
	
	/* alphanum */
	if (light_isalnum(c)) return 1;
	
	
	switch(c) {
		/* reserved */
	case ';':
	case '/':
	case '?': 
	case ':':
	case '@':
	case '&':
	case '=':
	case '+':
	case '$':
	case ',':
		
		/* mark */
	case '-':
	case '_':
	case '.':
	case '!':
	case '~':
	case '*':
	case '\'':
	case '(':
	case ')':
		
		/* escaped */
	case '%':
		
		/* fragment, should not be out in the wild $*/
	case '#': 
		
		/* non RFC */
	case '[': 
	case ']':
	
		return 1;
	}
	
	return 0;
}

int http_request_parse(server *srv, connection *con) {
	char *uri = NULL, *proto = NULL, *method = NULL, con_length_set;
	int is_key = 1, key_len = 0, is_ws_after_key = 0, in_folding;
	char *value = NULL, *key = NULL;
	
	enum { HTTP_CONNECTION_UNSET, HTTP_CONNECTION_KEEPALIVE, HTTP_CONNECTION_CLOSE } keep_alive_set = HTTP_CONNECTION_UNSET;
	
	int line = 0;
	
	int request_line_stage = 0;
	size_t i, first;
	
	int done = 0;
	
	data_string *ds = NULL;
	
	/* 
	 * Request: "^(GET|POST|HEAD) ([^ ]+(\\?[^ ]+|)) (HTTP/1\\.[01])$" 
	 * Option : "^([-a-zA-Z]+): (.+)$"                    
	 * End    : "^$"
	 */

	if (con->conf.log_request_header) {
		log_error_write(srv, __FILE__, __LINE__, "sdsdSb", 
				"fd:", con->fd, 
				"request-len:", con->request.request->used, 
				"\n", con->request.request);
	}

	if (con->request_count > 1 &&
	    con->request.request->ptr[0] == '\r' &&
	    con->request.request->ptr[1] == '\n') {
		/* we are in keep-alive and might get \r\n after a previous POST request.*/
		
		buffer_copy_string_len(con->parse_request, con->request.request->ptr + 2, con->request.request->used - 1 - 2);
	} else {
		/* fill the local request buffer */
		buffer_copy_string_buffer(con->parse_request, con->request.request);
	}
	
	keep_alive_set = 0;
	con_length_set = 0;

	/* parse the first line of the request
	 *
	 * should be:
	 *
	 * <method> <uri> <protocol>\r\n
	 * */
	for (i = 0, first = 0; i < con->parse_request->used && line == 0; i++) {
		char *cur = con->parse_request->ptr + i;
		
		switch(*cur) {
		case '\r': 
			if (con->parse_request->ptr[i+1] == '\n') {
				http_method_t r;
				char *nuri = NULL;
				size_t j;
				
				/* \r\n -> \0\0 */
				con->parse_request->ptr[i] = '\0';
				con->parse_request->ptr[i+1] = '\0';
				
				buffer_copy_string_len(con->request.request_line, con->parse_request->ptr, i);
				
				if (request_line_stage != 2) {
					con->http_status = 400;
					con->response.keep_alive = 0;
					con->keep_alive = 0;
					
					log_error_write(srv, __FILE__, __LINE__, "s", "incomplete request line -> 400");
					if (srv->srvconf.log_request_header_on_error) {
						log_error_write(srv, __FILE__, __LINE__, "Sb",
								"request-header:\n",
								con->request.request);
					}
					return 0;
				}
				
				proto = con->parse_request->ptr + first;
				
				*(uri - 1) = '\0';
				*(proto - 1) = '\0';
				
				/* we got the first one :) */
				if (-1 == (r = get_http_method_key(method))) {
					con->http_status = 501;
					con->response.keep_alive = 0;
					con->keep_alive = 0;
					
					log_error_write(srv, __FILE__, __LINE__, "s", "unknown http-method -> 501");
					if (srv->srvconf.log_request_header_on_error) {
							log_error_write(srv, __FILE__, __LINE__, "Sb",
									"request-header:\n",
									con->request.request);
						}
					
					return 0;
				}
				
				con->request.http_method = r;
				
				if (0 == strncmp(proto, "HTTP/1.", sizeof("HTTP/1.") - 1)) {
					if (proto[7] == '1') {
						con->request.http_version = con->conf.allow_http11 ? HTTP_VERSION_1_1 : HTTP_VERSION_1_0;
					} else if (proto[7] == '0') {
						con->request.http_version = HTTP_VERSION_1_0;
					} else { 
						con->http_status = 505;

						log_error_write(srv, __FILE__, __LINE__, "s", "unknown HTTP version -> 505");
						if (srv->srvconf.log_request_header_on_error) {
							log_error_write(srv, __FILE__, __LINE__, "Sb",
									"request-header:\n",
									con->request.request);
						}
						return 0;
					}
				} else {
					con->http_status = 400;
					con->keep_alive = 0;

					log_error_write(srv, __FILE__, __LINE__, "s", "unknown protocol -> 400");
					if (srv->srvconf.log_request_header_on_error) {
							log_error_write(srv, __FILE__, __LINE__, "Sb",
									"request-header:\n",
									con->request.request);
						}
					return 0;
				}
				
				if (0 == strncmp(uri, "http://", 7) &&
				    NULL != (nuri = strchr(uri + 7, '/'))) {
					/* ignore the host-part */
					
					buffer_copy_string_len(con->request.uri, nuri, proto - nuri - 1);
				} else {
					/* everything looks good so far */
					buffer_copy_string_len(con->request.uri, uri, proto - uri - 1);
				}
				
				/* check uri for invalid characters */
				for (j = 0; j < con->request.uri->used - 1; j++) {
					if (!request_uri_is_valid_char(con->request.uri->ptr[j])) {
						con->http_status = 400;
						con->keep_alive = 0;
						
						log_error_write(srv, __FILE__, __LINE__, "sd",
								"invalid character in URI -> 400",
								con->request.uri->ptr[j]);
						
						if (srv->srvconf.log_request_header_on_error) {
							log_error_write(srv, __FILE__, __LINE__, "Sb",
									"request-header:\n",
									con->request.request);
						}
						
						return 0;
					}
				}
				
				buffer_copy_string_buffer(con->request.orig_uri, con->request.uri);
				
				con->http_status = 0;
				
				i++;
				line++;
				first = i+1;
			}
			break;
		case ' ':
			switch(request_line_stage) {
			case 0: 
				/* GET|POST|... */
				method = con->parse_request->ptr + first; 
				first = i + 1;
				break;
			case 1:
				/* /foobar/... */
				uri = con->parse_request->ptr + first; 
				first = i + 1;
				break;
			default:
				/* ERROR, one space to much */
				con->http_status = 400;
				con->response.keep_alive = 0;
				con->keep_alive = 0;
				
				log_error_write(srv, __FILE__, __LINE__, "s", "overlong request line -> 400");
				if (srv->srvconf.log_request_header_on_error) {
					log_error_write(srv, __FILE__, __LINE__, "Sb",
							"request-header:\n",
							con->request.request);
				}
				return 0;
			}
			
			request_line_stage++;
			break;
		}
	}
	
	in_folding = 0;
	
	for (; i < con->parse_request->used && !done; i++) {
		char *cur = con->parse_request->ptr + i;
		
		if (is_key) {
			size_t j;
			int got_colon = 0;
			
			/**
			 * 1*<any CHAR except CTLs or separators>
			 * CTLs == 0-31 + 127
			 * 
			 */
			switch(*cur) {
			case ':':
				is_key = 0;
				
				value = cur + 1;
				
				if (is_ws_after_key == 0) {
					key_len = i - first;
				}
				is_ws_after_key = 0;
					
				break;
			case '(':
			case ')':
			case '<':
			case '>':
			case '@':
			case ',':
			case ';':
			case '\\':
			case '\"':
			case '/':
			case '[':
			case ']':
			case '?':
			case '=':
			case '{':
			case '}':
				con->http_status = 400;
				con->keep_alive = 0;
				con->response.keep_alive = 0;
				
				log_error_write(srv, __FILE__, __LINE__, "sbsds", 
						"invalid character in key", con->request.request, cur, *cur, "-> 400");
				return 0;
			case ' ':
			case '\t':
				if (i == first) {
					is_key = 0;
					in_folding = 1;
					value = cur;
					
					break;
				}
				
				
				key_len = i - first;
				
				/* skip every thing up to the : */
				for (j = 1; !got_colon; j++) {
					switch(con->parse_request->ptr[j + i]) {
					case ' ':
					case '\t':
						/* skip WS */
						continue;
					case ':':
						/* ok, done */
						
						i += j - 1;
						got_colon = 1;
						
						break;
					default:
						/* error */
						
						log_error_write(srv, __FILE__, __LINE__, "s", "WS character in key -> 400");
					
						con->http_status = 400;
						con->response.keep_alive = 0;
						con->keep_alive = 0;
						
						return 0;
					}
				}
				
				break;
			case '\r':
				if (con->parse_request->ptr[i+1] == '\n' && i == first) {
					/* End of Header */
					con->parse_request->ptr[i] = '\0';
					con->parse_request->ptr[i+1] = '\0';
					
					i++;
					
					done = 1;
					
					break;
				} else {
					log_error_write(srv, __FILE__, __LINE__, "s", "CR without LF -> 400");
					
					con->http_status = 400;
					con->keep_alive = 0;
					con->response.keep_alive = 0;
					return 0;
				}
				/* fall thru */
			case 0: /* illegal characters (faster than a if () :) */
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
			case 8:
			case 10:
			case 11:
			case 12:
			case 14:
			case 15:
			case 16:
			case 17:
			case 18:
			case 19:
			case 20:
			case 21:
			case 22:
			case 23:
			case 24:
			case 25:
			case 26:
			case 27:
			case 28:
			case 29:
			case 30:
			case 31:
			case 127:
				con->http_status = 400;
				con->keep_alive = 0;
				con->response.keep_alive = 0;
				
				log_error_write(srv, __FILE__, __LINE__, "sbsds", 
						"CTL character in key", con->request.request, cur, *cur, "-> 400");
				
				return 0;
			default:
				/* ok */
				break;
			}
		} else {
			switch(*cur) {
			case '\r': 
				if (con->parse_request->ptr[i+1] == '\n') {
					/* End of Headerline */
					con->parse_request->ptr[i] = '\0';
					con->parse_request->ptr[i+1] = '\0';
					
					if (in_folding) {
						if (!ds) {
							/* 400 */
					
							log_error_write(srv, __FILE__, __LINE__, "s", "WS at the start of first line -> 400");
					
							con->http_status = 400;
							con->keep_alive = 0;
							con->response.keep_alive = 0;
							return 0;
						}
						buffer_append_string(ds->value, value);
					} else {
						int s_len;
						key = con->parse_request->ptr + first;
					
						s_len = cur - value;
						
						if (s_len > 0) {
							int cmp = 0;
							if (NULL == (ds = (data_string *)array_get_unused_element(con->request.headers, TYPE_STRING))) {
								ds = data_string_init();
							}
							buffer_copy_string_len(ds->key, key, key_len);
							buffer_copy_string_len(ds->value, value, s_len);
							
							/* retreive values 
							 * 
							 * 
							 * the list of options is sorted to simplify the search
							 */
							
							if (0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Connection")))) {
								array *vals;
								size_t vi;
								
								/* split on , */
								
								vals = srv->split_vals;

								array_reset(vals);
								
								http_request_split_value(vals, ds->value);
								
								for (vi = 0; vi < vals->used; vi++) {
									data_string *dsv = (data_string *)vals->data[vi];
									
									if (0 == buffer_caseless_compare(CONST_BUF_LEN(dsv->value), CONST_STR_LEN("keep-alive"))) {
										keep_alive_set = HTTP_CONNECTION_KEEPALIVE;
										
										break;
									} else if (0 == buffer_caseless_compare(CONST_BUF_LEN(dsv->value), CONST_STR_LEN("close"))) {
										keep_alive_set = HTTP_CONNECTION_CLOSE;
										
										break;
									}
								}
								
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Content-Length")))) {
								char *err;
								unsigned long int r;
								size_t j;
								
								if (ds->value->used == 0) SEGFAULT();
								
								for (j = 0; j < ds->value->used - 1; j++) {
									char c = ds->value->ptr[j];
									if (!isdigit((unsigned char)c)) {
										log_error_write(srv, __FILE__, __LINE__, "sbs", 
												"content-length broken:", ds->value, "-> 400");
										
										con->http_status = 400;
										con->keep_alive = 0;
										
										array_insert_unique(con->request.headers, (data_unset *)ds);
										return 0;
									}
								}
								
								r = strtoul(ds->value->ptr, &err, 10);
								
								if (*err == '\0') {
									con_length_set = 1;
									con->request.content_length = r;
								} else {
									log_error_write(srv, __FILE__, __LINE__, "sbs", 
											"content-length broken:", ds->value, "-> 400");
									
									con->http_status = 400;
									con->keep_alive = 0;
									
									array_insert_unique(con->request.headers, (data_unset *)ds);
									return 0;
								}
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Content-Type")))) {
								con->request.http_content_type = ds->value->ptr;
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Expect")))) {
								/* HTTP 2616 8.2.3 
								 * Expect: 100-continue
								 * 
								 *   -> (10.1.1)  100 (read content, process request, send final status-code)
								 *   -> (10.4.18) 417 (close)
								 * 
								 * (not handled at all yet, we always send 417 here)
								 */
								
								con->http_status = 417;
								con->keep_alive = 0;
								
								array_insert_unique(con->request.headers, (data_unset *)ds);
								return 0;
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Host")))) {
								con->request.http_host = ds->value;
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("If-Modified-Since")))) {
								con->request.http_if_modified_since = ds->value->ptr;
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("If-None-Match")))) {
								con->request.http_if_none_match = ds->value->ptr;
							} else if (cmp > 0 && 0 == (cmp = buffer_caseless_compare(CONST_BUF_LEN(ds->key), CONST_STR_LEN("Range")))) {
								/* bytes=.*-.* */
								
								if (0 == strncasecmp(ds->value->ptr, "bytes=", 6) &&
								    NULL != strchr(ds->value->ptr+6, '-')) {
									
									con->request.http_range = ds->value->ptr + 6;
								}
							}
							
							array_insert_unique(con->request.headers, (data_unset *)ds);
						} else {
							/* empty header-fields are not allowed by HTTP-RFC, we just ignore them */
						}
					}
					
					i++;
					first = i+1;
					is_key = 1;
					value = 0;
					key_len = 0;
					in_folding = 0;
				} else {
					log_error_write(srv, __FILE__, __LINE__, "sbs", 
							"CR without LF", con->request.request, "-> 400");
					
					con->http_status = 400;
					con->keep_alive = 0;
					con->response.keep_alive = 0;
					return 0;
				}
				break;
			case ' ':
			case '\t':
				/* strip leading WS */
				if (value == cur) value = cur+1;
			default:
				break;
			}
		}
	}
	
	con->header_len = i;
	
	/* do some post-processing */

	if (con->request.http_version == HTTP_VERSION_1_1) {
		if (keep_alive_set != HTTP_CONNECTION_CLOSE) {
			/* no Connection-Header sent */
			
			/* HTTP/1.1 -> keep-alive default TRUE */
			con->keep_alive = 1;
		} else {
			con->keep_alive = 0;
		}
		
		/* RFC 2616, 14.23 */
		if (con->request.http_host == NULL ||
		    buffer_is_empty(con->request.http_host)) {
			con->http_status = 400;
			con->response.keep_alive = 0;
			con->keep_alive = 0;
			
			log_error_write(srv, __FILE__, __LINE__, "s", "HTTP/1.1 but Host missing -> 400");
			return 0;
		}
	} else {
		if (keep_alive_set == HTTP_CONNECTION_KEEPALIVE) {
			/* no Connection-Header sent */
			
			/* HTTP/1.0 -> keep-alive default FALSE  */
			con->keep_alive = 1;
		} else {
			con->keep_alive = 0;
		}
	}
	
	/* check hostname field */
	if (0 != request_check_hostname(srv, con, con->request.http_host)) {
		log_error_write(srv, __FILE__, __LINE__, "sbs",
				"Invalid Hostname:", con->request.http_host, "-> 400");
		
		con->http_status = 400;
		con->response.keep_alive = 0;
		con->keep_alive = 0;
		
		return 0;
	}
	
	/* check if we have read post data */
	if (con->request.http_method == HTTP_METHOD_POST) {
		server_socket *srv_socket = con->srv_socket;
		if (con->request.http_content_type == NULL) {
			log_error_write(srv, __FILE__, __LINE__, "s", 
					"POST request, but content-type not set");
		}
		
		if (con_length_set == 0) {
			/* content-length is missing */
			log_error_write(srv, __FILE__, __LINE__, "s", 
					"POST-request, but content-length missing -> 411");
			
			con->http_status = 411;
			return 0;
		}
		
		/* don't handle more the SSIZE_MAX bytes in content-length */
		if (con->request.content_length > SSIZE_MAX) {
			con->http_status = 413; 

			log_error_write(srv, __FILE__, __LINE__, "sds", 
					"request-size too long:", con->request.content_length, "-> 413");
			return 0;
		}
		
		/* divide by 1024 as srvconf.max_request_size is in kBytes */
		if (srv_socket->max_request_size != 0 &&
		    (con->request.content_length >> 10) > srv_socket->max_request_size) {
			/* the request body itself is larger then 
			 * our our max_request_size
			 */
		
			con->http_status = 413;
		
			log_error_write(srv, __FILE__, __LINE__, "sds", 
					"request-size too long:", con->request.content_length, "-> 413");
			return 0;
		}
		
		
		/* we have content */
		if (con->request.content_length != 0) {
			return 1;
		}
	}
	
	return 0;
}

int http_request_header_finished(server *srv, connection *con) {
	UNUSED(srv);

	if (con->request.request->used < 5) return 0;
	
	if (0 == memcmp(con->request.request->ptr + con->request.request->used - 5, "\r\n\r\n", 4)) return 1;
	if (NULL != strstr(con->request.request->ptr, "\r\n\r\n")) return 1;
	
	return 0;
}
